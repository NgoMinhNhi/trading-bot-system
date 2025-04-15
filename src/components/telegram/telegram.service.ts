import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot: TelegramBot;
  private readonly logger = new Logger(TelegramService.name);

  constructor(private configService: ConfigService) {}

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
      const name = msg.from?.first_name || 'bạn';

      const welcomeText = `👋 Chào mừng ${name} đến với bot NestJS!\nBạn có thể chọn một trong các chức năng dưới đây:`;

      const inlineKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📊 Account Info', callback_data: 'account_info' },
              { text: '📈 Open Position', callback_data: 'open_position' },
            ],
            [
              { text: '📜 Order Histories', callback_data: 'order_histories' },
            ],
          ],
        },
      };

      this.bot.sendMessage(chatId, welcomeText, inlineKeyboard);
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
    const mock = `📊 *Account Info*\nBalance: 10,000 USD\nEquity: 10,100 USD\nMargin: 250 USD`;
    this.bot.sendMessage(chatId, mock, { parse_mode: 'Markdown' });
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
    return this.bot.sendMessage(chatId, text);
  }
}
