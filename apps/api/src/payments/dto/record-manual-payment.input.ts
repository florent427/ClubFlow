import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { ClubPaymentMethod } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

@InputType()
export class RecordManualPaymentInput {
  @Field(() => ID)
  @IsUUID()
  invoiceId!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  amountCents!: number;

  @Field(() => ClubPaymentMethod)
  @IsEnum(ClubPaymentMethod)
  method!: ClubPaymentMethod;

  /** N° de chèque, réf. virement, libellé de rapprochement, etc. */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  externalRef?: string | null;

  @Field(() => ID, {
    nullable: true,
    description:
      'Membre payeur réel (portail ou saisie admin). Null = encaissement sans fiche payeur.',
  })
  @IsOptional()
  @IsUUID()
  paidByMemberId?: string | null;

  @Field(() => ID, {
    nullable: true,
    description:
      'Contact payeur (sans fiche membre). Exclusif avec paidByMemberId si renseigné.',
  })
  @IsOptional()
  @IsUUID()
  paidByContactId?: string | null;
}
