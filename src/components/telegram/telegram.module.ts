import { Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { HttpClientModule } from '../../common/http/http-client.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../trading/schemas/order.schema';
import { Mt5Account, Mt5AccountSchema } from '../trading/schemas/mt5-account.schema';
@Module({
  imports: [
    HttpClientModule,
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Mt5Account.name, schema: Mt5AccountSchema },
    ]),
  ],
  controllers: [TelegramController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
