import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  InvoiceStatus,
  PaymentScheduleInstallmentStatus,
  PaymentScheduleMethod,
  PaymentScheduleStatus,
} from '@prisma/client';

// Les enums Prisma sont enregistrés dans `src/graphql/register-enums.ts`.

/** Une échéance, telle que le trésorier la lit dans le back-office. */
@ObjectType()
export class AdminPaymentScheduleInstallmentGraph {
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

  @Field(() => Boolean, {
    description:
      'Encore due et exigible avant aujourd’hui (fuseau du club). Une échéance en cours de prélèvement n’est pas en retard.',
  })
  overdue!: boolean;

  @Field(() => Boolean, {
    description:
      'Un règlement saisi au club (espèces, chèque, virement, avance) solderait cette échéance, dans l’ordre des rangs.',
  })
  settleableByPayment!: boolean;
}

/** Un échéancier du club, avec son état mois par mois. */
@ObjectType()
export class AdminPaymentScheduleGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  invoiceId!: string;

  @Field(() => String)
  invoiceLabel!: string;

  @Field(() => InvoiceStatus)
  invoiceStatus!: InvoiceStatus;

  @Field(() => String, {
    nullable: true,
    description: 'Foyer ou famille de la facture ; null si elle n’en a pas.',
  })
  payerLabel!: string | null;

  @Field(() => PaymentScheduleMethod)
  method!: PaymentScheduleMethod;

  @Field(() => PaymentScheduleStatus, {
    description:
      'PENDING_SETUP : aucune carte ni mandat enregistré, rien n’est prélevé.',
  })
  status!: PaymentScheduleStatus;

  @Field(() => Int)
  totalCents!: number;

  @Field(() => Int)
  installmentCount!: number;

  @Field(() => Int)
  paidCount!: number;

  @Field(() => Int)
  paidCents!: number;

  @Field(() => Int, { description: 'Somme des échéances encore dues.' })
  remainingCents!: number;

  @Field(() => Int)
  overdueCount!: number;

  @Field(() => Int)
  overdueCents!: number;

  @Field(() => Date, {
    nullable: true,
    description: 'Prochaine échéance due qui n’est pas en retard ; null si aucune.',
  })
  nextDueOn!: Date | null;

  @Field(() => Int, { nullable: true })
  nextDueCents!: number | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => [AdminPaymentScheduleInstallmentGraph], {
    description: 'Échéances triées par rang croissant.',
  })
  installments!: AdminPaymentScheduleInstallmentGraph[];
}
