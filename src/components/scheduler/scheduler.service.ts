// src/components/scheduler/scheduler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TradingService } from '../trading/trading.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly tradingService: TradingService) {}
  @Cron('0 * * * * *') // Runs every 1 minutes
  async handleCron() {
    this.logger.debug('Running scheduled task every 1 minutes');

    try {
      await this.tradingService.handleCronJob();
    } catch (error) {
      this.logger.error(`Scheduled task failed: ${error}`);
    }
  }
}
