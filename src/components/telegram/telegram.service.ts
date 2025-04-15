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

    this.bot.on('message', (msg) => {
      const chatId = msg.chat.id;
      this.bot.sendMessage(chatId, '👋 Xin chào! Tôi là bot NestJS.');
    });

    // Ví dụ lắng nghe lệnh "/start"
    this.bot.onText(/\/start/, (msg) => {
      this.bot.sendMessage(
        msg.chat.id,
        `Chào mừng ${msg.from?.first_name || 'bạn'} đến với bot!`,
      );
    });
  }

  sendMessage(chatId: number | string, text: string) {
    return this.bot.sendMessage(chatId, text);
  }
}
