// src/components/trading/trading.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateResult } from 'mongoose';
import { Order, OrderDocument, OrderStatus } from './schemas/order.schema';
import {
  Mt5Account,
  Mt5AccountDocument,
  AccountStatus,
} from './schemas/mt5-account.schema';
import { ApiClientService } from '../api-client/api-client.service';
import { TelegramService } from '../telegram/telegram.service';

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

  async findAll(): Promise<Order[]> {
    return this.orderModel.find().exec();
  }

  async findAccountByChatId(chatId: number): Promise<Mt5Account | null> {
    return this.mt5AccountModel.findOne({ chatIds: chatId }).exec();
  }

  async findByTicket(ticket: number): Promise<Order | null> {
    return this.orderModel.findOne({ ticket }).exec();
  }

  async findByOrderId(orderId: string): Promise<Order | null> {
    return this.orderModel.findOne({ order: orderId }).exec();
  }
  async findOrdersByConditions(conditions: any): Promise<Order[] | []> {
    return this.orderModel.find(conditions).exec();
  }

  async updateOrder(order: number, data: any): Promise<any> {
    return this.orderModel.updateOne({ order }, data).exec();
  }
  async createMt5Account(
    accountData: Partial<Mt5Account>,
  ): Promise<Mt5Account> {
    try {
      const createdAccount = new this.mt5AccountModel(accountData);
      return createdAccount.save();
    } catch (error) {
      this.logger.error(`Failed to create MT5 account: ${error.message}`);
      throw error;
    }
  }

  async findAllMt5Accounts(): Promise<Mt5Account[]> {
    return this.mt5AccountModel.find().exec();
  }

  async findActiveAccounts(): Promise<Mt5AccountDocument[]> {
    return this.mt5AccountModel.find({ status: AccountStatus.ACTIVE }).exec();
  }

  async findMt5AccountByLogin(login: number): Promise<Mt5Account | null> {
    return this.mt5AccountModel.findOne({ login }).exec();
  }

  async handleCronJob() {
    const accounts = await this.findActiveAccounts();
    for (const account of accounts) {
      try {
        // Call your API client to fetch data
        const data = await this.apiClientService.fetchData('orders', {
          login: account.login,
          password: account.password,
          server: account.server,
        });
        if (data?.open_positions) {
          for (const order of data.open_positions) {
            const checkedOrder = await this.findByOrderId(order.order);
            if (!checkedOrder) {
              await this.createOrder({
                ...order,
                accountId: account._id,
                status: OrderStatus.OPENING,
              });
              //Todo: Send notification to Telegram
              this.telegramService.sendOpenTradeNotification(
                account.chatIds,
                order,
              );
            }
          }
        }
        // const openingOrders = await this.findOrdersByConditions({
        //   status: OrderStatus.OPENING,
        // });
        const closedOrders = data?.closed_deals?.filter(order => order?.order !== order?.position_id);
        await Promise.all(
          closedOrders?.map(async (order) => {
            if (order?.order !== order?.position_id) {
              return;
            }
            const checkedOrder = await this.findByOrderId(order.order);
            if (!checkedOrder) {
              if (account?.sendNotify) {
                this.telegramService.sendClosedTradeNotification(
                  account.chatIds,
                  order,
                );
              }
              return await this.createOrder({
                ...order,
                accountId: account._id,
                status: OrderStatus.CLOSED,
              });
            }
            if (checkedOrder?.status !== OrderStatus.CLOSED) {
              //Todo: Send notification to Telegram
              if (account?.sendNotify) {
                this.telegramService.sendClosedTradeNotification(
                  account.chatIds,
                  order,
                );
              }
              return await this.updateOrder(order.order, {
                ...order,
                status: OrderStatus.CLOSED,
              });
            }
          }),
        );
        // if (openingOrders?.length && closedOrders?.length) {
        //   for (const order of openingOrders) {
        //     const checkedOrder = closedOrders.find(
        //       (closedOrder) => closedOrder.ticket === order.ticket,
        //     );
        //     if (checkedOrder) {
        //       await this.updateOrder(order.ticket, {
        //         status: OrderStatus.CLOSED,
        //       });
        //       //Todo: Send notification to Telegram
        //       if (account?.sendNotify) {
        //         this.telegramService.sendClosedTradeNotification(
        //           account.chatIds,
        //           order,
        //         );
        //       }
        //     }
        //   }
        // }
        // Process the result as needed
        this.logger.log(`Fetched data for account ${account.login}`);
      } catch (error) {
        this.logger.error(
          `Failed to fetch data for account ${account.login}: ${error.message}`,
        );
      }
    }
  }
}
