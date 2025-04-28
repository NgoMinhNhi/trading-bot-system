// src/components/scheduler/scheduler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApiClientService } from '../api-client/api-client.service';
import { TelegramService } from '../telegram/telegram.service';
import { TradingService } from '../trading/trading.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly apiClientService: ApiClientService,
    private readonly telegramService: TelegramService,
    private readonly tradingService: TradingService,
  ) {}

  @Cron('0 */2 * * * *') // Runs every 5 minutes
  async handleCron() {
    this.logger.debug('Running scheduled task every 5 minutes');

    try {
      await this.tradingService.handleCronJob();
    } catch (error) {
      this.logger.error(`Scheduled task failed: ${error}`);
    }
  }
}
