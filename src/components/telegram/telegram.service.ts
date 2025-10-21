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
import * as XLSX from 'xlsx';

interface QueueItem {
  chatId: number | string;
  text: string;
  options?: TelegramBot.SendMessageOptions;
}

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot: TelegramBot;
  private readonly logger = new Logger(TelegramService.name);
  private messageQueue: QueueItem[] = [];
  private isProcessingQueue = false;
  constructor(
    private configService: ConfigService,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Mt5Account.name)
    private mt5AccountModel: Model<Mt5AccountDocument>,
  ) {}

  private async processQueue() {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.messageQueue.length > 0) {
      const data = this.messageQueue.shift();
      if (!data) {
        continue;
      }
      const { chatId, text, options } = data;
      try {
        await this.bot.sendMessage(chatId, text, options);
        this.logger.debug(`✅ Sent message to ${chatId}`);
      } catch (error: any) {
        if (error.response?.statusCode === 429) {
          const retryAfter = error.response.body?.parameters?.retry_after || 5;
          this.logger.warn(`⏳ Rate limited. Retry after ${retryAfter}s`);
          await sleep(retryAfter * 1000);
          // Requeue the message
          this.messageQueue.unshift({ chatId, text, options });
        } else {
          this.logger.error(
            `🚨 Failed to send message to ${chatId}: ${error.message}`,
          );
        }
      }

      // ⏱ Delay 0.5 giây giữa mỗi message
      await sleep(500);
    }

    this.isProcessingQueue = false;
  }

  private buildProfitSharingMessageVND(
    account: Mt5Account,
    totalProfit: number,
    title: string,
    options?: { vndRate?: number }, // <— thêm tuỳ chọn
  ): string {
    const totalSlots = account.slotHolders.reduce((sum, h) => sum + h.slots, 0);

    const fmtVND = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} đ`;

    let message =
      `${title}\n\n` +
      `👤 *Tài khoản:* ${account.login}${account?.name ? ` - ${account.name}` : ''}\n` +
      `• Server: ${account.server}\n` +
      `• Tổng lợi nhuận: *${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)} ${account?.currency || 'USD'}*`;

    if (options?.vndRate && options.vndRate > 0) {
      const totalVnd = totalProfit * options.vndRate;
      message += ` (~ *${fmtVND(totalVnd)}*)`;
    }

    message +=
      `\n• Tổng slot: ${totalSlots}\n\n` + `📑 *Chi tiết phân chia:*\n`;

    for (const holder of account.slotHolders) {
      const share = (holder.slots / totalSlots) * totalProfit;
      let line = `- ${holder.name}: ${share >= 0 ? '+' : ''}${share.toFixed(2)}`;
      line += ` (${holder.slots} slot)`;

      if (options?.vndRate && options.vndRate > 0) {
        const vnd = share * options.vndRate;
        line += `  ~ ${fmtVND(vnd)}`;
      }
      message += `${line}\n`;
    }

    return message;
  }

  private createExcelReport(data: any[], accountId: string): Buffer {
    // Cấu hình bảng Excel
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PnL Report');

    // Tạo tên file theo accountId
    const fileName = `PnL_Report_${accountId}.xlsx`;

    // Chuyển đổi thành file Excel
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
    return excelBuffer;
  }

  private buildProfitSharingData(
    account: Mt5Account,
    totalProfit: number,
    rate: number,
    config: { subtractFee: boolean }, // Biến config
  ) {
    const totalSlots = account.slotHolders.reduce(
      (sum, holder) => sum + holder.slots,
      0,
    );

    // Trừ phí bán 0.5 USD nếu cấu hình trừ phí
    if (config.subtractFee) {
      totalProfit -= 0.5; // Trừ 0.5 USD
    }

    // Dữ liệu đầu vào
    const data: any[] = [];

    for (const holder of account.slotHolders) {
      const share = (holder.slots / totalSlots) * totalProfit;
      const shareVND = share * rate;

      data.push({
        'Họ tên': holder.name,
        slot: holder.slots,
        Lời: `${share.toFixed(2)} USD`,
        'Tỉ Giá USD': rate,
        USDT: (share / rate).toFixed(2),
        'Trạng Thái': '',
        'Binance UID': '',
        VND: `${shareVND.toFixed(2)} đ`,
      });
    }

    // Thêm dòng trừ phí vào cuối bảng
    if (config.subtractFee) {
      data.push({
        'Họ tên': 'Trừ 0.5u phí bán',
        slot: '',
        Lời: '-0.5 USD',
        'Tỉ Giá USD': rate,
        USDT: '-0.01',
        'Trạng Thái': '',
        'Binance UID': '',
        VND: `${(0.5 * rate).toFixed(2)} đ`,
      });
    }

    return data;
  }

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

  private buildProfitSharingMessage(
    account: Mt5Account,
    totalProfit: number,
    title: string,
  ): string {
    const totalSlots = account.slotHolders.reduce(
      (sum, holder) => sum + holder.slots,
      0,
    );

    let message =
      `${title}\n\n` +
      `👤 *Tài khoản:* ${account.login}${account?.name ? ` - ${account.name}` : ''}\n` +
      `• Server: ${account.server}\n` +
      `• Tổng lợi nhuận: *${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(
        2,
      )} ${account?.currency || 'USD'}*\n` +
      `• Tổng slot: ${totalSlots}\n\n` +
      `📑 *Chi tiết phân chia:*\n`;

    for (const holder of account.slotHolders) {
      const share = (holder.slots / totalSlots) * totalProfit;
      message += `- ${holder.name}: ${share >= 0 ? '+' : ''}${share.toFixed(
        2,
      )} (${holder.slots} slot)\n`;
    }

    return message;
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
    this.bot.onText(/^\/profits\s+(.*)$/, async (msg, match) => {
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
      const duration = this.parseDuration(match[0], 'profits');

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

    this.bot.onText(/^\/pnl$/, async (msg) => {
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

    this.bot.onText(/^\/pnl_slot$/, async (msg) => {
      const chatId = msg.chat.id;
      const accounts = await this.mt5AccountModel
        .find({ chatIds: chatId })
        .lean();

      for (const account of accounts) {
        const lastCashout =
          account.lastCashout || new Date('2025-01-01').getTime();
        const accountId = (account._id as mongoose.Types.ObjectId).toString();
        const profit = await this.getClosedProfitAfterTime(
          accountId,
          lastCashout,
        );

        const message = this.buildProfitSharingMessage(
          account,
          profit,
          `📊 *Báo cáo PnL từ lần cashout gần nhất (chia theo slot)*`,
        );

        await this.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        await sleep(1000);
      }
    });

    this.bot.onText(
      /^\/pnl_slot_vnd\s+([0-9]+(?:\.[0-9]+)?)$/,
      async (msg, match) => {
        const chatId = msg.chat.id;
        const rate = parseFloat(match?.[1] || '0');

        if (!rate || rate <= 0) {
          await this.sendMessage(
            chatId,
            '⚠️ Cú pháp: `/pnl_slot_vnd <ty_gia_vnd_tren_1_usdt>`\n*Ví dụ:* `/pnl_slot_vnd 25500`',
            { parse_mode: 'Markdown' },
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
          const lastCashout =
            account.lastCashout || new Date('2025-01-01').getTime();
          const accountId = (account._id as mongoose.Types.ObjectId).toString();

          // Lợi nhuận từ lần cashout gần nhất
          const profit = await this.getClosedProfitAfterTime(
            accountId,
            lastCashout,
          );

          const message = this.buildProfitSharingMessageVND(
            account,
            profit,
            `📊 *Báo cáo PnL từ lần cashout gần nhất (chia theo slot)*\n💱 Tỉ giá quy đổi: *${rate.toLocaleString('vi-VN')} VND / USDT*`,
            { vndRate: rate },
          );

          await this.sendMessage(chatId, message, { parse_mode: 'Markdown' });
          await sleep(1000);
        }
      },
    );

    this.bot.onText(
      /^\/pnl_slot_vnd_export\s+([0-9]+(?:\.[0-9]+)?)$/,
      async (msg, match) => {
        const chatId = msg.chat.id;
        const rate = parseFloat(match?.[1] || '0');

        if (!rate || rate <= 0) {
          await this.sendMessage(
            chatId,
            '⚠️ Cú pháp: `/pnl_slot_vnd_export <ty_gia_vnd_tren_1_usdt>`\n*Ví dụ:* `/pnl_slot_vnd_export 25500`',
            { parse_mode: 'Markdown' },
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
          const lastCashout =
            account.lastCashout || new Date('2025-01-01').getTime();

          // Tính lợi nhuận từ lần cashout gần nhất
          const profit = await this.getClosedProfitAfterTime(
            accountId,
            lastCashout,
          );

          // Tính dữ liệu phân chia, trừ phí bán
          const data = this.buildProfitSharingData(account, profit, rate, {
            subtractFee: true,
          });

          // Tạo file Excel từ dữ liệu
          const excelBuffer = this.createExcelReport(data, accountId);

          // Gửi file Excel qua Telegram
          const fileName = `PnL_Report_${accountId}.xlsx`;
          const document = {
            source: excelBuffer,
            filename: fileName,
          };

          try {
            // Truyền trực tiếp buffer và caption vào sendDocument
            await this.bot.sendDocument(chatId, excelBuffer, { caption: `Báo cáo PnL cho tài khoản ${accountId}` });
            this.logger.debug(`📨 Sent Excel file to ${chatId}`);
          } catch (error) {
            this.logger.error(`🚨 Failed to send Excel file to ${chatId}: ${error.message}`);
          }

          await sleep(1000);
        }
      },
    );

    this.bot.onText(/^\/profits_slot\s+(.*)$/, async (msg, match) => {
      const chatId = msg.chat.id;

      if (!match || !match[0]) {
        await this.sendMessage(
          chatId,
          '⚠️ Cú pháp không hợp lệ. Ví dụ: `/pnl_xd 7d`',
          { parse_mode: 'Markdown' },
        );
        return;
      }

      const inputText = match[0];
      const duration = this.parseDuration(match[0], 'profits_slot');

      if (!duration) {
        await this.sendMessage(
          chatId,
          '❌ Không hiểu yêu cầu. Ví dụ đúng: `/pnl_xd 7d`, `/pnl_xd 24h`',
          { parse_mode: 'Markdown' },
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

        // Tính tổng lợi nhuận theo duration
        const profit = await this.getClosedProfitWithinDuration(
          accountId,
          duration,
        );

        const message = this.buildProfitSharingMessage(
          account,
          profit,
          `📊 *Báo cáo PnL (${inputText}) - chia theo slot*`,
        );

        await this.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        await sleep(1000);
      }
    });
  }

  private parseDuration(text: string, command: string): number | null {
    const regex = new RegExp(`^\\/${command}\\s+(\\d+)([dhmM])$`);
    const match = text.trim().match(regex);
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
  sendMessage(
    chatId: number | string,
    text: string,
    options?: TelegramBot.SendMessageOptions,
  ) {
    this.messageQueue.push({ chatId, text, options });
    this.logger.debug(
      `📨 Queued message to ${chatId}. Queue length: ${this.messageQueue.length}`,
    );

    // Nếu worker chưa chạy thì kích hoạt
    if (!this.isProcessingQueue) {
      this.processQueue();
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
