import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { ChequeDepositStatus, ChequeStatus } from '@prisma/client';
import { SignedPhotoField } from '../../media/signed-photo-field.decorator';

registerEnumType(ChequeStatus, {
  name: 'ChequeStatus',
  description:
    'PENDING = en portefeuille (511200), DEPOSITED = remis en banque, BOUNCED = impayé, CANCELLED = saisie annulée.',
});

registerEnumType(ChequeDepositStatus, {
  name: 'ChequeDepositStatus',
  description:
    'DEPOSITED = remise faite, RECONCILED = rapprochée avec le relevé bancaire, CANCELLED = annulée par contre-passation.',
});

/** Chèque reçu par le club (ADR-0015). Dates calendaires en « YYYY-MM-DD ». */
@ObjectType()
export class ChequeGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true })
  number!: string | null;

  @Field()
  drawerName!: string;

  @Field(() => String, { nullable: true })
  bankName!: string | null;

  @Field(() => Int)
  amountCents!: number;

  @Field()
  receivedOn!: string;

  @Field(() => ChequeStatus)
  status!: ChequeStatus;

  /** Paiement de facture réglé par ce chèque ; null pour un chèque hors facture. */
  @Field(() => ID, { nullable: true })
  paymentId!: string | null;

  @Field(() => ID, { nullable: true })
  invoiceId!: string | null;

  @Field(() => String, { nullable: true })
  invoiceLabel!: string | null;

  /** Écriture de produit d'un chèque hors facture. */
  @Field(() => ID, { nullable: true })
  entryId!: string | null;

  @Field(() => ID, { nullable: true })
  depositId!: string | null;

  @Field(() => String, { nullable: true })
  depositNumber!: string | null;

  @Field(() => ID, { nullable: true })
  imageAssetId!: string | null;

  @SignedPhotoField('Photo du chèque : URL signée, valable un temps limité.')
  imageUrl!: string | null;

  @Field(() => String, { nullable: true })
  notes!: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;
}

/** Remise de chèques en banque (ADR-0015). */
@ObjectType()
export class ChequeDepositGraph {
  @Field(() => ID)
  id!: string;

  /** « R-2026-0007 » : séquentiel par club et par exercice. */
  @Field()
  number!: string;

  @Field(() => ID)
  financialAccountId!: string;

  @Field()
  financialAccountLabel!: string;

  @Field()
  depositedOn!: string;

  @Field(() => Int)
  totalCents!: number;

  @Field(() => Int)
  chequeCount!: number;

  @Field(() => ChequeDepositStatus)
  status!: ChequeDepositStatus;

  /** Écriture DÉBIT 512x / CRÉDIT 511200 du total. */
  @Field(() => ID, { nullable: true })
  entryId!: string | null;

  @Field(() => ID, { nullable: true })
  slipAssetId!: string | null;

  @SignedPhotoField('Bordereau PDF : URL signée, valable un temps limité.')
  slipUrl!: string | null;

  @Field(() => String, { nullable: true })
  notes!: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => [ChequeGraph])
  cheques!: ChequeGraph[];
}
