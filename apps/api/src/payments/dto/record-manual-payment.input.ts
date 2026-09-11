import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { ClubPaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Détails du chèque quand `method = MANUAL_CHECK` (ADR-0015). Tous
 * facultatifs : à défaut, le n° vient de `externalRef`, l'émetteur du payeur
 * ou du libellé de facture, la date de réception du jour.
 */
@InputType()
export class RecordChequeInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  number?: string | null;

  @Field(() => String, { nullable: true, description: 'Nom porté sur le chèque.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  drawerName?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankName?: string | null;

  @Field(() => String, { nullable: true, description: 'YYYY-MM-DD' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  receivedOn?: string | null;

  @Field(() => ID, { nullable: true, description: 'Photo du chèque (MediaAsset image).' })
  @IsOptional()
  @IsUUID()
  imageAssetId?: string | null;
}

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
      'Compte bancaire sur lequel l’argent est réellement arrivé (ADR-0014 §7). Par défaut, la route du mode de paiement.',
  })
  @IsOptional()
  @IsUUID()
  financialAccountId?: string | null;
}
