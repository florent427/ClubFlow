import { Field, ID, InputType } from '@nestjs/graphql';
import { ClubPaymentMethod } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

@InputType()
export class UpsertClubPaymentRouteInput {
  @Field(() => ClubPaymentMethod)
  @IsEnum(ClubPaymentMethod)
  method!: ClubPaymentMethod;

  @Field(() => ID)
  @IsUUID()
  financialAccountId!: string;
}
