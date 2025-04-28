import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelegramModule } from './components/telegram/telegram.module';
import { ConfigModule } from '@nestjs/config';
import { ApiClientModule } from './components/api-client/api-client.module';
import { SchedulerModule } from './components/scheduler/scheduler.module';
import { DatabaseModule } from './database/database.module';
import { TradingModule } from './components/trading/trading.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TelegramModule,
    ApiClientModule,
    SchedulerModule,
    DatabaseModule,
    TradingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
