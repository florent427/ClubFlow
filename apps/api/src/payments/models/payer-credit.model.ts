import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { ClubPaymentMethod } from '@prisma/client';

@ObjectType()
export class PayerCreditPaymentGraph {
  @Field(() => ID) id!: string;
  @Field(() => Int) amountCents!: number;
  @Field(() => ClubPaymentMethod) method!: ClubPaymentMethod;
  @Field(() => String, { nullable: true }) externalRef!: string | null;
  @Field(() => Date) createdAt!: Date;
}

@ObjectType()
export class PayerCreditDepositGraph {
  @Field(() => ID, { description: 'Reçu d’avance.' })
  invoiceId!: string;

  @Field()
  label!: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Int, {
    description: 'Net versé sur ce reçu, remboursements déduits.',
  })
  amountCents!: number;

  @Field(() => [PayerCreditPaymentGraph])
  payments!: PayerCreditPaymentGraph[];
}

/** Crédit d'une personne (ADR-0022). */
@ObjectType()
export class PayerCreditGraph {
  @Field(() => ID, { nullable: true })
  memberId!: string | null;

  @Field(() => ID, { nullable: true })
  contactId!: string | null;

  @Field()
  displayName!: string;

  @Field(() => Int, {
    description:
      'Crédit disponible, calculé à partir des paiements. Membre et contact d’un même compte utilisateur partagent le même crédit.',
  })
  balanceCents!: number;

  @Field(() => [PayerCreditDepositGraph])
  deposits!: PayerCreditDepositGraph[];
}

@ObjectType()
export class PayerCreditDepositResultGraph {
  @Field(() => ID, { description: 'Reçu d’avance créé.' })
  invoiceId!: string;

  @Field(() => ID)
  paymentId!: string;

  @Field(() => Int, { description: 'Crédit de la personne après le versement.' })
  balanceCents!: number;
}
