import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import { ConfigService } from '@nestjs/config';
import { sleep } from '../../utils/timeout';
import { InjectModel } from '@nestjs/mongoose';
import { Order, OrderDocument, OrderStatus } from '../trading/schemas/order.schema';
import { Model } from 'mongoose';
import { Mt5Account, Mt5AccountDocument } from '../trading/schemas/mt5-account.schema';
import mongoose from 'mongoose';

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot: TelegramBot;
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private configService: ConfigService,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Mt5Account.name)
    private mt5AccountModel: Model<Mt5AccountDocument>,
  ) {}

  async getClosedProfitWithinDuration(accountId: string, duration: number): Promise<number> {
    const fromTimestampSec = Math.floor((Date.now() - duration) / 1000); // ms → seconds

    const result = await this.orderModel.aggregate([
      {
        $match: {
          accountId: new mongoose.Types.ObjectId(accountId),
          status: OrderStatus.CLOSED,
          close_time: { $gte: fromTimestampSec },
        },
      },
      {
        $group: {
          _id: null,
          totalProfit: { $sum: '$profit' },
        },
      },
    ]);

    return result[0]?.totalProfit || 0;
  }

  onModuleInit() {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');

    if (!token) {
      this.logger.error('TELEGRAM_BOT_TOKEN is not defined');
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    this.bot = new TelegramBot(token, { polling: true });

    // Lệnh khởi động
    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      const name = msg.from?.first_name || 'bạn';
      const welcomeText = `👋 Chào mừng ${name} đến với bot NestJS!\nBạn có thể chọn một trong các chức năng dưới đây:`;
      this.bot.sendMessage(chatId, welcomeText);
    });

    // Xử lý callback query nếu có
    this.bot.on('callback_query', (query) => {
      const chatId = query.message?.chat.id;
      const data = query.data;

      if (!chatId) return;

      switch (data) {
        case 'account_info':
          this.handleAccountInfo(chatId);
          break;
        case 'open_position':
          this.handleOpenPositions(chatId);
          break;
        case 'order_histories':
          this.handleOrderHistories(chatId);
          break;
        default:
          this.bot.sendMessage(chatId, '❓ Không xác định chức năng.');
          break;
      }

      this.bot.answerCallbackQuery(query.id);
    });

    // ✅ Xử lý /profits [n][m]
    this.bot.onText(/\/profits\s*(.*)/, async (msg, match) => {
      if (!match || !match[0]) {
        await this.sendMessage(msg.chat.id, '⚠️ Cú pháp không hợp lệ. Ví dụ: `/profits 7d`', {
          parse_mode: 'Markdown',
        });
        return;
      }

      const chatId = msg.chat.id;
      const inputText = match[0];
      const duration = this.parseDuration(inputText);

      if (!duration) {
        await this.sendMessage(chatId, '❌ Không hiểu yêu cầu. Ví dụ đúng: `/profits 7d`, `/profits 24h`', {
          parse_mode: 'Markdown',
        });
        return;
      }

      const accounts = await this.mt5AccountModel.find({ chatIds: chatId });

      if (!accounts.length) {
        await this.sendMessage(chatId, '⚠️ Không tìm thấy tài khoản nào liên kết với Telegram này.');
        return;
      }

      for (const account of accounts) {
        const accountId = (account._id as mongoose.Types.ObjectId).toString();
        const profit = await this.getClosedProfitWithinDuration(accountId, duration);
        const timeLabel = inputText.split(' ')[1] || 'khoảng thời gian';

        const message =
          `💰 *Tổng lợi nhuận đã đóng (${timeLabel})*\n\n` +
          `• Tài khoản: *${account.login}*\n` +
          `• Server: ${account.server}\n` +
          `• Lợi nhuận: *${profit >= 0 ? '+' : ''}${profit.toFixed(2)} USD*`;

        await this.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        await sleep(1000);
      }
    });
  }

  private parseDuration(text: string): number | null {
    const match = text.trim().match(/^\/profits\s+(\d+)([dhmM])$/);
    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const msPer = {
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
      m: 60 * 1000,
      M: 30 * 24 * 60 * 60 * 1000,
    };

    return msPer[unit] ? value * msPer[unit] : null;
  }

  private handleAccountInfo(chatId: number | string) {}

  private handleOpenPositions(chatId: number | string) {
    const mock = `📈 *Open Positions*\nEURUSD – Buy 0.1 lot @ 1.0900\nXAUUSD – Sell 0.05 lot @ 1940`;
    this.bot.sendMessage(chatId, mock, { parse_mode: 'Markdown' });
  }

  private handleOrderHistories(chatId: number | string) {
    const mock = `📜 *Order Histories (7 ngày)*\n✅ Buy USDJPY – +$50\n❌ Sell EURUSD – -$20`;
    this.bot.sendMessage(chatId, mock, { parse_mode: 'Markdown' });
  }

  async sendMessage(chatId: number | string, text: string, options?: TelegramBot.SendMessageOptions) {
    try {
      return await this.bot.sendMessage(chatId, text, options);
    } catch (error: any) {
      if (error.response?.statusCode === 429) {
        const retryAfter = error.response.body?.parameters?.retry_after;
        console.error(`⏳ Too Many Requests! Retry after ${retryAfter || 'unknown'} seconds.`);
      } else {
        console.error('🚨 Unexpected error while sending message.', error);
      }
    }
  }

  sendOpenTradeNotification(chatIds: number[], order: any) {
    const { symbol, type, volume, price_open, price_current, profit, time } = order;
    const typeText = type === 0 ? '🟢 Buy' : '🔴 Sell';
    const date = new Date(time * 1000).toLocaleString('vi-VN');

    const message =
      `📥 *Lệnh mới được mở!*\n\n` +
      `• ${typeText} ${symbol}\n` +
      `• Khối lượng: *${volume} lot*\n` +
      `• Giá mở cửa: *${price_open}*\n` +
      `• Giá hiện tại: *${price_current}*\n` +
      `• Lợi nhuận tạm tính: *${profit >= 0 ? '+' : ''}${profit.toFixed(2)} USD*\n` +
      `• Thời gian mở: ${date}`;

    chatIds.forEach(async (id) => {
      await this.sendMessage(id, message, { parse_mode: 'Markdown' });
      await sleep(1000);
    });
  }

  sendClosedTradeNotification(chatIds: number[], order: any) {
    const {
      symbol,
      type,
      volume,
      close_price,
      profit,
      ticket,
      close_time,
      comment,
    } = order;

    const typeText = type !== 0 ? '🟢 Buy' : '🔴 Sell';
    const date = new Date(close_time * 1000).toLocaleString('vi-VN');

    const message =
      `📤 *Lệnh đã đóng!*\n\n` +
      `• ${typeText} ${symbol}\n` +
      `• Khối lượng: *${volume} lot*\n` +
      `• Giá mở: *${order.open_price}*\n` +
      `• Giá đóng: *${close_price}*\n` +
      `• Lợi nhuận: *${profit >= 0 ? '+' : ''}${profit.toFixed(2)} USD*\n` +
      `• Ticket: ${ticket}\n` +
      `• Thời gian đóng: ${date}\n` +
      (comment ? `• Ghi chú: \`${comment}\`\n` : '');

    chatIds.forEach(async (chatId) => {
      await this.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      await sleep(1000);
    });

    return true;
  }
}
