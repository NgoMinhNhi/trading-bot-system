// src/components/trading/trading.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument, OrderStatus } from './schemas/order.schema';
import {
  Mt5Account,
  Mt5AccountDocument,
  AccountStatus,
} from './schemas/mt5-account.schema';
import { ApiClientService } from '../api-client/api-client.service';
import { TelegramService } from '../telegram/telegram.service';
import { sleep } from '../../utils/timeout';

@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);

  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Mt5Account.name)
    private mt5AccountModel: Model<Mt5AccountDocument>,
    private apiClientService: ApiClientService,
    private telegramService: TelegramService,
  ) {}

  async createOrder(orderData: any): Promise<Order | null> {
    try {
      const existingOrder = await this.orderModel
        .findOne({
          ticket: orderData.ticket,
        })
        .exec();

      if (existingOrder) {
        return await this.orderModel
          .findOneAndUpdate({ ticket: orderData.ticket }, orderData, {
            new: true,
          })
          .exec();
      }

      const createdOrder = new this.orderModel(orderData);
      return createdOrder.save();
    } catch (error) {
      this.logger.error(`Failed to save order: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findByTicket(ticket: number): Promise<Order | null> {
    return this.orderModel.findOne({ ticket }).exec();
  }

  async findByOrderId(orderId: string): Promise<Order | null> {
    return this.orderModel.findOne({ order: orderId }).exec();
  }
  async updateOrder(order: number, data: any): Promise<any> {
    return this.orderModel.updateOne({ order }, data).exec();
  }

  async findActiveAccounts(): Promise<Mt5AccountDocument[]> {
    return this.mt5AccountModel.find({ status: AccountStatus.ACTIVE }).exec();
  }

  async checkOpenPositions() {
    const accounts = await this.findActiveAccounts();
    for (const account of accounts) {
      try {
        const data = await this.apiClientService.fetchData('open_positions', {
          login: account.login,
          password: account.password,
          server: account.server,
        });
        const openOrders = data?.open_positions;
        if (!openOrders) continue;

        for (const order of openOrders) {
          order.time = order?.time - 3 * 60 * 60 || new Date().getTime();
          const exists = await this.findByTicket(order.ticket);
          if (!exists) {
            await this.createOrder({
              ...order,
              accountId: account._id,
              status: OrderStatus.OPENING,
            });
            this.telegramService.sendOpenTradeNotification(
              account.chatIds,
              order,
            );
          }
        }
      } catch (error) {
        this.logger.error(
          `checkOpenPositions error (login ${account.login}): ${error.message}`,
        );
      }
    }
  }
  async checkClosedOrders() {
    const accounts = await this.findActiveAccounts();
    for (const account of accounts) {
      try {
        const data = await this.apiClientService.fetchData('closed_deals', {
          login: account.login,
          password: account.password,
          server: account.server,
        });
        const closedOrders = data?.closed_deals;
        if (!closedOrders) continue;

        for (const order of closedOrders) {
          order.close_time =
            order?.close_time - 3 * 60 * 60 || new Date().getTime();
          const existing = await this.findByOrderId(order.order);
          if (!existing) {
            if (account?.sendNotify) {
              this.telegramService.sendClosedTradeNotification(
                account.chatIds,
                order,
              );
            }
            await this.createOrder({
              ...order,
              accountId: account._id,
              status: OrderStatus.CLOSED,
            });
          } else if (existing.status !== OrderStatus.CLOSED) {
            if (account?.sendNotify) {
              this.telegramService.sendClosedTradeNotification(
                account.chatIds,
                order,
              );
            }
            await this.updateOrder(order.order, {
              ...order,
              status: OrderStatus.CLOSED,
            });
          }
          await sleep(1000);
        }
      } catch (error) {
        this.logger.error(
          `checkClosedOrders error (login ${account.login}): ${error.message}`,
        );
      }
    }
  }
}
