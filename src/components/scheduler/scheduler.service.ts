// src/components/scheduler/scheduler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TradingService } from '../trading/trading.service';
import { sleep } from '../../utils/timeout';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly tradingService: TradingService) {}

  @Cron('0 * * * * *')
  async checkClosedOrdersJob() {
    try {
      await this.tradingService.checkOpenPositions();
      await sleep(1000);
      await this.tradingService.checkClosedOrders();
    } catch (error) {
      this.logger.error(`Closed order job failed: ${error.message}`);
    }
  }
}
