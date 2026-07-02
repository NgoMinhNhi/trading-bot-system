// src/components/trading/trading.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Order, OrderDocument, OrderStatus } from './schemas/order.schema';
import {
  AccountStatus,
  Mt5Account,
  Mt5AccountDocument,
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
    private configService: ConfigService,
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

  async updateOrderById(id: any, data: any): Promise<any> {
    return this.orderModel.updateOne({ _id: id }, data).exec();
  }

  async findTrackedOrder(accountId: any, orderData: any): Promise<Order | null> {
    if (orderData?.position_id) {
      return this.orderModel
        .findOne({ accountId, position_id: orderData.position_id })
        .exec();
    }

    const filters = [];
    if (orderData?.ticket) {
      filters.push({ accountId, ticket: orderData.ticket });
    }
    if (orderData?.order) {
      filters.push({ accountId, order: orderData.order });
    }

    if (!filters.length) {
      return null;
    }

    return this.orderModel.findOne({ $or: filters }).exec();
  }

  private hasTrackedOrderChanged(existing: any, orderData: any): boolean {
    const fields = [
      'ticket',
      'order',
      'position_id',
      'commission',
      'fee',
      'profit',
      'reason',
      'swap',
      'symbol',
      'time',
      'type',
      'volume',
      'open_time',
      'close_time',
    ];

    return fields.some((field) => existing?.[field] !== orderData?.[field]);
  }

  async findActiveAccounts(): Promise<Mt5AccountDocument[]> {
    return this.mt5AccountModel.find({ status: AccountStatus.ACTIVE }).exec();
  }
  async checkStates() {
    const accounts = await this.findActiveAccounts();
    for (const account of accounts) {
      try {
        this.checkStateByAccount(account).then();
        await sleep(200);
      } catch (error) {
        this.logger.error(
          `checkOpenPositions error (login ${account.login}): ${error.message}`,
        );
      }
    }
  }

  async checkStateByAccount(account: any) {
    try {
      const data = await this.apiClientService.getAllData({
        login: account.login,
        mt5Path: account.mt5Path,
        password: account.password,
        server: account.server,
      });
      await this.dumpHistoryOrdersIfEnabled(account, data);
      if (!account?.ignoreOpenDeal) {
        await this.checkOpenPositions(data?.open_positions, account);
      }
      await this.checkClosedOrders(data?.closed_deals, account);
    } catch (error) {
      this.logger.error(
        `checkOpenPositions error (login ${account.login}): ${error.message}`,
      );
    }
  }

  private isHistoryOrderDumpEnabled(): boolean {
    const value = this.configService.get<string>('HISTORY_ORDER_DUMP_ENABLED');
    return ['1', 'true', 'yes', 'on'].includes((value || '').toLowerCase());
  }

  private getHistoryOrderDumpDir(): string {
    const configuredDir = this.configService.get<string>('HISTORY_ORDER_DUMP_DIR');
    const dumpDir = configuredDir || 'history-order-dumps';
    return path.isAbsolute(dumpDir)
      ? dumpDir
      : path.resolve(process.cwd(), dumpDir);
  }

  private sanitizeFileName(value: any): string {
    return String(value ?? 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '_');
  }

  private async dumpHistoryOrdersIfEnabled(
    account: any,
    data: any,
  ): Promise<void> {
    if (!this.isHistoryOrderDumpEnabled()) {
      return;
    }

    try {
      const dumpDir = this.getHistoryOrderDumpDir();
      await fs.mkdir(dumpDir, { recursive: true });

      const fileName = `history-orders-${this.sanitizeFileName(
        account.login,
      )}-${this.sanitizeFileName(account.server)}.json`;
      const filePath = path.join(dumpDir, fileName);
      const tmpPath = `${filePath}.tmp`;
      const closedDeals = Array.isArray(data?.closed_deals)
        ? data.closed_deals
        : [];

      const payload = {
        dumpedAt: new Date().toISOString(),
        source: 'apiClientService.getAllData(/mt5/all-v2)',
        account: {
          _id: account?._id?.toString?.() || account?._id,
          login: account?.login,
          name: account?.name,
          server: account?.server,
          mt5Path: account?.mt5Path,
        },
        apiStatus: data?.status,
        apiAccount: data?.account,
        counts: {
          closedDeals: closedDeals.length,
          openPositions: Array.isArray(data?.open_positions)
            ? data.open_positions.length
            : 0,
        },
        historyOrders: closedDeals,
      };

      await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
      await fs.rename(tmpPath, filePath);
      this.logger.log(
        `History order dump saved for login ${account.login}: ${filePath}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to dump history orders for login ${account.login}: ${error.message}`,
        error.stack,
      );
    }
  }

  async checkOpenPositions(openOrders: any, account: any) {
    try {
      if (!openOrders) {
        return;
      }
      for (const order of openOrders) {
        order.time = order?.time - 3 * 60 * 60 || new Date().getTime();
        const exists = await this.findByTicket(order.ticket);
        if (!exists) {
          await this.createOrder({
            ...order,
            accountId: account._id,
            status: OrderStatus.OPENING,
          });
          this.telegramService.sendOpenTradeNotification(account, order);
        }
      }
    } catch (error) {
      this.logger.error(`checkOpenPositions error: ${error.message}`);
    }
  }
  async checkClosedOrders(closedOrders: any, account: any) {
    try {
      if (!closedOrders || closedOrders.length === 0) return;

      await Promise.all(
        closedOrders.map(async (order, index) => {
          try {
            order.close_time =
              order?.close_time - 3 * 60 * 60 || new Date().getTime();

            const existing = await this.findTrackedOrder(account._id, order);

            // Nếu chưa tồn tại => tạo mới + gửi notify
            if (!existing) {
              if (account?.sendNotify) {
                await this.telegramService.sendClosedTradeNotification(
                  account,
                  order,
                );
              }
              await this.createOrder({
                ...order,
                accountId: account._id,
                status: OrderStatus.CLOSED,
              });
            }
            // Nếu đã có nhưng chưa CLOSED => cập nhật + gửi notify
            else if (
              existing.status !== OrderStatus.DELETED &&
              existing.status !== OrderStatus.CLOSED
            ) {
              if (account?.sendNotify) {
                await this.telegramService.sendClosedTradeNotification(
                  account,
                  order,
                );
              }
              await this.updateOrderById(existing._id, {
                ...order,
                accountId: account._id,
                status: OrderStatus.CLOSED,
              });
            }
            // Nếu dữ liệu CLOSED cũ bị tính sai (ví dụ thiếu close-by entry=3)
            // thì cập nhật im lặng để báo cáo PnL lần sau dùng số thực tế.
            else if (
              existing.status === OrderStatus.CLOSED &&
              this.hasTrackedOrderChanged(existing, order)
            ) {
              await this.updateOrderById(existing._id, {
                ...order,
                accountId: account._id,
                status: OrderStatus.CLOSED,
              });
            }

            // Delay nhẹ để tránh spam Telegram (tuỳ chọn)
            await sleep(1000 * index);
          } catch (innerErr) {
            this.logger.error(
              `checkClosedOrders item error: ${innerErr.message}`,
            );
          }
        }),
      );
    } catch (error) {
      this.logger.error(`checkClosedOrders error: ${error.message}`);
    }
  }
}
