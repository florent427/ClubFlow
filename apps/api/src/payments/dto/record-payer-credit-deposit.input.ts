import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { ClubPaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { RecordChequeInput } from './record-manual-payment.input';

/** Plafond d'une avance saisie par l'admin : 10 000 €. */
export const PAYER_CREDIT_DEPOSIT_MAX_CENTS = 1_000_000;

/** Avance encaissée sans facture (ADR-0022). */
@InputType()
export class RecordPayerCreditDepositInput {
  @Field(() => ID, {
    nullable: true,
    description: 'Membre crédité. Exactement un de memberId / contactId.',
  })
  @IsOptional()
  @IsUUID()
  memberId?: string | null;

  @Field(() => ID, {
    nullable: true,
    description: 'Contact crédité. Exactement un de memberId / contactId.',
  })
  @IsOptional()
  @IsUUID()
  contactId?: string | null;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(PAYER_CREDIT_DEPOSIT_MAX_CENTS)
  amountCents!: number;

  @Field(() => ClubPaymentMethod, {
    description: 'Espèces, chèque ou virement.',
  })
  @IsEnum(ClubPaymentMethod)
  method!: ClubPaymentMethod;

  /** N° de chèque, référence de virement… */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  externalRef?: string | null;

  @Field(() => RecordChequeInput, {
    nullable: true,
    description: 'Détails du chèque, si method = MANUAL_CHECK.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RecordChequeInput)
  cheque?: RecordChequeInput | null;

  @Field(() => ID, {
    nullable: true,
    description:
      'Banque sur laquelle un virement est arrivé. Par défaut, la route du mode de paiement.',
  })
  @IsOptional()
  @IsUUID()
  financialAccountId?: string | null;
}
