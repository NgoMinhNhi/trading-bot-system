// src/components/trading/schemas/mt5-account.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DELETED = 'DELETED',
}
@Schema({ timestamps: true })
export class Mt5Account {
  @Prop({ required: true, unique: true })
  login: number;

  @Prop()
  name: string;

  @Prop()
  currency: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true })
  server: string;

  @Prop()
  chatIds: number[];

  @Prop({
    default: false,
  })
  sendNotify: boolean;

  @Prop()
  ignoreOpenDeal: boolean;

  @Prop()
  balanceInit: number;

  @Prop()
  lastCashout: number;

  @Prop({
    type: [
      {
        name: String,  // Tên người
        slots: Number, // Số slot người này giữ
      },
    ],
    default: [],
  })
  slotHolders: { name: string; slots: number }[];

  @Prop({
    type: String,
    enum: AccountStatus,
    default: AccountStatus.ACTIVE,
  })
  status: AccountStatus;

  @Prop()
  mt5Path: string;

  @Prop()
  subtractFee: boolean;

  @Prop({
    type: {
      name: String, // Tên người control bot
      percentage: Number, // % lợi nhuận được chia (ví dụ: 10 = 10%)
    },
    default: null,
  })
  controllerShare: { name: string; percentage: number } | null;
}

export type Mt5AccountDocument = Mt5Account & Document;

export const Mt5AccountSchema = SchemaFactory.createForClass(Mt5Account);
