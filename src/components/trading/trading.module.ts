// src/components/trading/trading.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from './schemas/order.schema';
import { Mt5Account, Mt5AccountSchema } from './schemas/mt5-account.schema';
import { TradingService } from './trading.service';
import { ApiClientModule } from '../api-client/api-client.module';
import { TelegramService } from '../telegram/telegram.service';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Mt5Account.name, schema: Mt5AccountSchema },
    ]),
    ApiClientModule,
    TelegramModule,
  ],
  providers: [TradingService],
  exports: [TradingService],
})
export class TradingModule {}
