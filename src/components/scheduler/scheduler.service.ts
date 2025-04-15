// src/components/scheduler/scheduler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApiClientService } from '../api-client/api-client.service';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly apiClientService: ApiClientService,
    private readonly telegramService: TelegramService,
  ) {}

  // @Cron('0 */5 * * * *') // Runs every 5 minutes
  // async handleCron() {
  //   this.logger.debug('Running scheduled task every 5 minutes');
  //
  //   try {
  //     // Call your third-party API
  //     const data = await this.apiClientService.fetchData('some-endpoint');
  //
  //     // Process the data
  //     this.logger.log('Data fetched successfully');
  //
  //     // Optionally send notification via Telegram
  //     // this.telegramService.sendMessage('your-chat-id', 'Scheduled task completed successfully');
  //   } catch (error) {
  //     this.logger.error(`Scheduled task failed: ${error}`);
  //   }
  // }
}
