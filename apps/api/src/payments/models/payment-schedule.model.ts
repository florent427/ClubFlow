import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  PaymentScheduleInstallmentStatus,
  PaymentScheduleMethod,
  PaymentScheduleStatus,
} from '@prisma/client';

// Les enums Prisma sont enregistrés dans `src/graphql/register-enums.ts`
// (emplacement unique du repo, cf. ClubPaymentMethod / InvoiceStatus).

@ObjectType()
export class PaymentScheduleInstallmentGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => Int, { description: 'Rang dans l’échéancier, de 1 à N.' })
  seq!: number;

  @Field(() => Date, { description: 'Date d’exigibilité, au jour près.' })
  dueOn!: Date;

  @Field(() => Int)
  amountCents!: number;

  @Field(() => PaymentScheduleInstallmentStatus)
  status!: PaymentScheduleInstallmentStatus;
}

@ObjectType()
export class PaymentScheduleGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  invoiceId!: string;

  @Field(() => PaymentScheduleMethod)
  method!: PaymentScheduleMethod;

  @Field(() => PaymentScheduleStatus, {
    description:
      'PENDING_SETUP tant qu’aucun moyen de paiement n’est enregistré : l’échéancier n’est pas encore prélevable.',
  })
  status!: PaymentScheduleStatus;

  @Field(() => Int, {
    description:
      'Montant couvert par l’échéancier : le SOLDE restant dû au moment de la création, pas le montant total de la facture.',
  })
  totalCents!: number;

  @Field(() => Int)
  installmentCount!: number;

  @Field(() => [PaymentScheduleInstallmentGraph], {
    description: 'Échéances triées par rang croissant.',
  })
  installments!: PaymentScheduleInstallmentGraph[];
}

@ObjectType()
export class PaymentScheduleSetupSessionGraph {
  @Field(() => String, {
    description:
      'URL Stripe hébergée à ouvrir côté portail pour enregistrer le moyen de paiement.',
  })
  url!: string;

  @Field(() => String)
  sessionId!: string;
}
