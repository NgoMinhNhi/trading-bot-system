// src/components/scheduler/scheduler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TradingService } from '../trading/trading.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly tradingService: TradingService) {}

  @Cron('*/10 * * * * *') // every 5 seconds
  async checkOpenOrdersJob() {
    try {
      await this.tradingService.checkOpenPositions();
    } catch (error) {
      this.logger.error(`Open order job failed: ${error.message}`);
    }
  }

  @Cron('*/30 * * * * *') // every 15 seconds
  async checkClosedOrdersJob() {
    try {
      await this.tradingService.checkClosedOrders();
    } catch (error) {
      this.logger.error(`Closed order job failed: ${error.message}`);
    }
  }
}
