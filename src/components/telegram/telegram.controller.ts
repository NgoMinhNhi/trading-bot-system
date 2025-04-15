import { Controller } from '@nestjs/common';
import { TelegramService } from './telegram.service';

@Controller({ path: 'telegram', version: '1' })
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {
  }

}
