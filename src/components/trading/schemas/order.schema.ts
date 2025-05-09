// src/components/trading/schemas/order.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import mongoose from 'mongoose';

export type OrderDocument = Order & Document;

export enum OrderStatus {
  ACTIVE = 'ACTIVE',
  OPENING = 'OPENING',
  NOTIFIED = 'NOTIFIED',
  CLOSED = 'CLOSED',
}
@Schema({ timestamps: true })
export class Order {
  @Prop()
  ticket: number;

  @Prop()
  order: number;

  @Prop({ index: true })
  external_id: string;

  @Prop()
  position_id: number;

  @Prop()
  comment: string;

  @Prop()
  commission: number;

  @Prop()
  entry: number;

  @Prop()
  fee: number;

  @Prop()
  magic: number;

  @Prop()
  price: number;

  @Prop()
  profit: number;

  @Prop()
  reason: number;

  @Prop()
  swap: number;

  @Prop({ required: true })
  symbol: string;

  @Prop()
  time: number;

  @Prop()
  time_msc: number;

  @Prop()
  type: number;

  @Prop({ required: true })
  volume: number;

  @Prop()
  open_time: number;

  @Prop()
  close_time: number;

  @Prop({
    type: String,
    enum: OrderStatus,
    default: OrderStatus.ACTIVE,
  })
  status: OrderStatus;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Mt5Account' })
  accountId: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
