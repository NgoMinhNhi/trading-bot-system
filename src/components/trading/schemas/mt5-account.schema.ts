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

  @Prop({
    type: String,
    enum: AccountStatus,
    default: AccountStatus.ACTIVE,
  })
  status: AccountStatus;
}

export type Mt5AccountDocument = Mt5Account & Document;

export const Mt5AccountSchema = SchemaFactory.createForClass(Mt5Account);
