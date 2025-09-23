import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import { ConfigService } from '@nestjs/config';
import { sleep } from '../../utils/timeout';
import { InjectModel } from '@nestjs/mongoose';
import {
  Order,
  OrderDocument,
  OrderStatus,
} from '../trading/schemas/order.schema';
import { Model } from 'mongoose';
import {
  Mt5Account,
  Mt5AccountDocument,
} from '../trading/schemas/mt5-account.schema';
import mongoose from 'mongoose';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { roundTo } from '../../utils/number';
import { formatTime } from '../../utils/time';

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

  async getClosedProfitWithinDuration(
    accountId: string,
    duration: number,
  ): Promise<number> {
    const fromTimestampSec = Math.floor((Date.now() - duration) / 1000);

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

  async getClosedProfitAfterTime(
    accountId: string,
    time: number,
  ): Promise<number> {
    const fromTimestampSec = Math.floor(time / 1000);
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

    // ⚙️ Khởi tạo bot với proxy
    this.bot = new TelegramBot(token, {
      polling: true,
      // ...(proxyHost && { request: { agent } as any }),
    });

    // Xử lý lệnh /start
    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      const name = msg.from?.first_name || 'bạn';
      const welcomeText = `👋 Chào mừng ${name} đến với bot MetaTrader 5!\nChúc bạn có thật nhiều lợi nhuận!`;
      this.bot.sendMessage(chatId, welcomeText);
    });

    // Lệnh /profits
    this.bot.onText(/\/profits\s*(.*)/, async (msg, match) => {
      if (!match || !match[0]) {
        await this.sendMessage(
          msg.chat.id,
          '⚠️ Cú pháp không hợp lệ. Ví dụ: `/profits 7d`',
          {
            parse_mode: 'Markdown',
          },
        );
        return;
      }

      const chatId = msg.chat.id;
      const inputText = match[0];
      const duration = this.parseDuration(inputText);

      if (!duration) {
        await this.sendMessage(
          chatId,
          '❌ Không hiểu yêu cầu. Ví dụ đúng: `/profits 7d`, `/profits 24h`',
          {
            parse_mode: 'Markdown',
          },
        );
        return;
      }

      const accounts = await this.mt5AccountModel
        .find({ chatIds: chatId })
        .lean();

      if (!accounts.length) {
        await this.sendMessage(
          chatId,
          '⚠️ Không tìm thấy tài khoản nào liên kết với Telegram này.',
        );
        return;
      }

      for (const account of accounts) {
        const accountId = (account._id as mongoose.Types.ObjectId).toString();
        const profit = await this.getClosedProfitWithinDuration(
          accountId,
          duration,
        );
        let profitRate: any = null;
        if (account?.balanceInit) {
          profitRate = roundTo((profit / account.balanceInit) * 100, 2);
        }
        const timeLabel = inputText.split(' ')[1] || 'khoảng thời gian';

        let message =
          `💰 *Tổng lợi nhuận đã đóng (${timeLabel})*\n` +
          `• Tài khoản: *${account.login}*${account?.name ? ` - *${account.name}*` : ''}\n` +
          `• Server: ${account.server}\n` +
          `• Lợi nhuận: *${profit >= 0 ? '+' : ''}${profit.toFixed(2)} ${account?.currency || 'USD'}*`;
        if (profitRate !== null) {
          message += `(${profitRate}%)`;
        }

        await this.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        await sleep(1000);
      }
    });

    this.bot.onText(/\/pnl/, async (msg) => {
      console.log('Received /pnl command');
      const chatId = msg.chat.id;

      const accounts = await this.mt5AccountModel
        .find({ chatIds: chatId })
        .lean();

      if (!accounts.length) {
        await this.sendMessage(
          chatId,
          '⚠️ Không tìm thấy tài khoản nào liên kết với Telegram này.',
        );
        return;
      }

      for (const account of accounts) {
        const accountId = (account._id as mongoose.Types.ObjectId).toString();

        // Nếu chưa có lastCashout thì mặc định là 2025-01-01
        let lastCashout = account.lastCashout;
        if (!lastCashout) {
          lastCashout = new Date('2025-01-01').getTime();
        }

        // Tính tổng lợi nhuận từ lastCashout
        const profit = await this.getClosedProfitAfterTime(
          accountId,
          lastCashout,
        );

        // Tính tỉ lệ lợi nhuận
        let profitRate: any = null;
        if (account?.balanceInit) {
          profitRate = roundTo((profit / account.balanceInit) * 100, 2);
        }
        const lastCashoutLabel = account?.lastCashout
          ? formatTime(account.lastCashout, 'YYYY-MM-DD HH:mm:ss')
          : 'Chưa có';
        const message =
          `📊 *Báo cáo lợi nhuận từ lần cashout gần nhất*\n\n` +
          `👤 *Tài khoản:* ${account.login}${account?.name ? ` - ${account.name}` : ''}\n` +
          `• Server: ${account.server}\n` +
          `• Lợi nhuận: *${profit >= 0 ? '+' : ''}${profit.toFixed(2)} ${account?.currency || 'USD'}*\n` +
          (profitRate !== null ? `• Tỉ lệ: *${profitRate}%*\n` : '') +
          `• Lần cashout gần nhất: ${lastCashoutLabel}`;

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
  async sendMessage(
    chatId: number | string,
    text: string,
    options?: TelegramBot.SendMessageOptions,
  ) {
    try {
      return await this.bot.sendMessage(chatId, text, options);
    } catch (error: any) {
      if (error.response?.statusCode === 429) {
        const retryAfter = error.response.body?.parameters?.retry_after;
        console.error(
          `⏳ Too Many Requests! Retry after ${retryAfter || 'unknown'} seconds.`,
        );
      } else {
        console.error('🚨 Unexpected error while sending message.', error);
      }
    }
  }

  sendOpenTradeNotification(account: Mt5Account, order: any) {
    const { chatIds, name, login } = account;
    const { symbol, type, volume, price_open, price_current, profit, time } =
      order;
    const typeText = type === 0 ? '🟢 Buy' : '🔴 Sell';
    const date = new Date(time * 1000).toLocaleString('vi-VN');

    const message =
      `📥 *Lệnh mới được mở!* \n\n` +
      `👤 *Tài khoản:* ${login} ${name ? `(${name})` : ''}\n\n` +
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

  sendClosedTradeNotification(account: Mt5Account, order: any) {
    const { chatIds, name, login } = account;
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
      `👤 *Tài khoản:* ${login} ${name ? `(${name})` : ''}\n\n` +
      `• ${typeText} ${symbol}\n` +
      `• Khối lượng: *${volume} lot*\n` +
      `• Giá mở: *${order.open_price}*\n` +
      `• Giá đóng: *${close_price}*\n` +
      `• Lợi nhuận: *${profit >= 0 ? '+' : ''}${profit.toFixed(2)} USD*\n ` +
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
