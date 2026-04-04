import { Field, InputType } from '@nestjs/graphql';
import { IsEnum, IsFQDN } from 'class-validator';
import { ClubSendingDomainPurpose } from '@prisma/client';

@InputType()
export class CreateClubSendingDomainInput {
  @Field()
  @IsFQDN()
  fqdn!: string;

  @Field(() => ClubSendingDomainPurpose)
  @IsEnum(ClubSendingDomainPurpose)
  purpose!: ClubSendingDomainPurpose;
}
