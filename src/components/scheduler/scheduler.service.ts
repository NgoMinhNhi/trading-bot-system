// src/components/scheduler/scheduler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TradingService } from '../trading/trading.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly tradingService: TradingService) {}

  @Cron('0 * * * * *')
  async checkClosedOrdersJob() {
    try {
      await this.tradingService.checkStates();
    } catch (error) {
      this.logger.error(`Closed order job failed: ${error.message}`);
    }
  }
}
