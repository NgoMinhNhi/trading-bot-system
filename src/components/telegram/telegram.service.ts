import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot: TelegramBot;
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private configService: ConfigService,) {}

  onModuleInit() {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');

    if (!token) {
      this.logger.error('TELEGRAM_BOT_TOKEN is not defined');
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    this.bot = new TelegramBot(token, { polling: true });

    // Xử lý lệnh /start với inline keyboard
    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      console.log('chatId ', chatId);
      const name = msg.from?.first_name || 'bạn';

      const welcomeText = `👋 Chào mừng ${name} đến với bot NestJS!\nBạn có thể chọn một trong các chức năng dưới đây:`;

      this.bot.sendMessage(chatId, welcomeText);
    });

    // Xử lý khi user click vào nút inline keyboard
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

      // Xóa loading indicator trên Telegram UI
      this.bot.answerCallbackQuery(query.id);
    });
  }

  private handleAccountInfo(chatId: number | string) {

  }

  private handleOpenPositions(chatId: number | string) {
    const mock = `📈 *Open Positions*\nEURUSD – Buy 0.1 lot @ 1.0900\nXAUUSD – Sell 0.05 lot @ 1940`;
    this.bot.sendMessage(chatId, mock, { parse_mode: 'Markdown' });
  }

  private handleOrderHistories(chatId: number | string) {
    const mock = `📜 *Order Histories (7 ngày)*\n✅ Buy USDJPY – +$50\n❌ Sell EURUSD – -$20`;
    this.bot.sendMessage(chatId, mock, { parse_mode: 'Markdown' });
  }

  sendMessage(chatId: number | string, text: string) {
    try {
      return this.bot.sendMessage(chatId, text);
    } catch (error) {
      console.log('ChatId: ', chatId);
      this.logger.error(error);
    }
  }
  sendOpenTradeNotification(chatIds: number[], order: any) {
    const {
      comment,
      symbol,
      type,
      volume,
      price_open,
      price_current,
      profit,
      magic,
      sl,
      tp,
      time,
    } = order;

    const typeText = type === 0 ? '🟢 Buy' : '🔴 Sell';
    const date = new Date(time * 1000).toLocaleString('vi-VN');

    const message =
      `📥 *Lệnh mới được mở!*\n\n` +
      `• ${typeText} ${symbol}\n` +
      `• Khối lượng: *${volume} lot*\n` +
      `• Giá mở cửa: *${price_open}*\n` +
      `• Giá hiện tại: *${price_current}*\n` +
      `• Lợi nhuận tạm tính: *${profit >= 0 ? '+' : ''}${profit.toFixed(2)} USD*\n` +
      `• Magic: ${magic}\n` +
      `• SL / TP: ${sl || '-'} / ${tp || '-'}\n` +
      `• Thời gian mở: ${date}\n` +
      `• Ghi chú: \`${comment}\``;

    chatIds.forEach((id) => {
      this.sendMessage(id, message);
    });
  }
  sendClosedTradeNotification(chatIds: number[], order: any) {
    const {
      symbol,
      type,
      volume,
      price,
      profit,
      magic,
      ticket,
      time,
      comment,
    } = order;

    console.log('sendClosedTradeNotification ===> ', order);
    const typeText = type === 0 ? '🟢 Buy' : '🔴 Sell';
    const date = new Date(time * 1000).toLocaleString('vi-VN');

    const message =
      `📤 *Lệnh đã đóng!*\n\n` +
      `• ${typeText} ${symbol}\n` +
      `• Khối lượng: *${volume} lot*\n` +
      `• Giá đóng: *${price}*\n` +
      `• Lợi nhuận: *${profit >= 0 ? '+' : ''}${profit.toFixed(2)} USD*\n` +
      `• Ticket: ${ticket}\n` +
      `• Magic: ${magic}\n` +
      `• Thời gian đóng: ${date}\n` +
      (comment ? `• Ghi chú: \`${comment}\`\n` : '');

    chatIds.forEach((chatId) => {
      this.sendMessage(chatId, message);
    });
    return true;
  }
}
