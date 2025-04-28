// src/components/scheduler/scheduler.module.ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { ApiClientModule } from '../api-client/api-client.module';
import { TelegramModule } from '../telegram/telegram.module';
import { TradingModule } from '../trading/trading.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ApiClientModule,
    TelegramModule,
    TradingModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}
