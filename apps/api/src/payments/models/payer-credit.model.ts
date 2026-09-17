import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { ClubPaymentMethod, InvoiceStatus } from '@prisma/client';

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

/** Une imputation du crédit sur une facture (ADR-0022, §3). */
@ObjectType()
export class PayerCreditUseGraph {
  @Field(() => ID)
  paymentId!: string;

  @Field(() => ID)
  invoiceId!: string;

  @Field()
  invoiceLabel!: string;

  @Field(() => Int, {
    description: 'Montant imputé ; négatif pour un crédit rendu (avoir, annulation).',
  })
  amountCents!: number;

  @Field(() => Date)
  createdAt!: Date;
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

  @Field(() => [PayerCreditUseGraph])
  uses!: PayerCreditUseGraph[];
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

/** Une avance rendue en espèces, par virement ou par chèque (ADR-0022, tâche 4.2). */
@ObjectType()
export class PayerCreditDepositRefundGraph {
  @Field(() => ID, { description: 'Paiement négatif qui trace l’argent rendu.' })
  refundPaymentId!: string;

  @Field(() => ID, { description: 'Avoir émis sur le reçu d’avance.' })
  creditNoteId!: string;

  @Field(() => Int)
  amountCents!: number;

  @Field(() => String, {
    description:
      'Comment l’argent est rendu : CASH, TRANSFER, CHEQUE_RETURN, CHEQUE_PARTIAL ou CHEQUE_DEPOSITED.',
  })
  kind!: string;

  @Field(() => Int, { description: 'Crédit de la personne après le remboursement.' })
  creditBalanceCents!: number;
}

/** Une personne qui peut régler la facture avec son crédit. */
@ObjectType()
export class PayerCreditCandidateGraph {
  @Field(() => ID, {
    nullable: true,
    description: 'Profil au nom duquel la facture serait réglée : un membre OU un contact.',
  })
  memberId!: string | null;

  @Field(() => ID, { nullable: true })
  contactId!: string | null;

  @Field()
  displayName!: string;

  @Field(() => Int)
  balanceCents!: number;
}

/** Le crédit d'une personne d'un foyer : le foyer affiche, il ne possède rien. */
@ObjectType()
export class FamilyPayerCreditGraph {
  @Field(() => ID, {
    nullable: true,
    description: 'Fiche de la personne dans le foyer : un membre OU un contact.',
  })
  memberId!: string | null;

  @Field(() => ID, { nullable: true })
  contactId!: string | null;

  @Field()
  displayName!: string;

  @Field(() => Int, {
    description: 'Crédit de la personne, jamais nul ; négatif s’il est à régulariser.',
  })
  balanceCents!: number;
}

@ObjectType()
export class PayerCreditApplyResultGraph {
  @Field(() => ID)
  paymentId!: string;

  @Field(() => ID)
  invoiceId!: string;

  @Field(() => Int, { description: 'Montant imputé.' })
  amountCents!: number;

  @Field(() => Int, { description: 'Crédit de la personne après l’imputation.' })
  creditBalanceCents!: number;

  @Field(() => InvoiceStatus)
  invoiceStatus!: InvoiceStatus;

  @Field(() => Int, { description: 'Reste dû de la facture après l’imputation.' })
  invoiceBalanceCents!: number;
}
