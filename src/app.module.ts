import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelegramModule } from './components/telegram/telegram.module';
import { ConfigModule } from '@nestjs/config';
import { ApiClientModule } from './components/api-client/api-client.module';
import { SchedulerModule } from './components/scheduler/scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TelegramModule,
    ApiClientModule,
    SchedulerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
