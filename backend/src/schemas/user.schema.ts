import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ required: true })
  userName!: string;

  @Prop({ type: [String], required: true })
  roleId!: string[];
}

export const UserSchema = SchemaFactory.createForClass(User);
