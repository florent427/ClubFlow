import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ClubPaymentMethod } from '@prisma/client';
import { PayerCreditMovementKind } from '../payer-credit-movements';

registerEnumType(PayerCreditMovementKind, { name: 'PayerCreditMovementKind' });

/** Une ligne de l'historique du crédit, côté portail et appli. */
@ObjectType()
export class ViewerPayerCreditMovementGraph {
  @Field(() => ID, { description: 'Le paiement qui fait le mouvement.' })
  paymentId!: string;

  @Field(() => PayerCreditMovementKind)
  kind!: PayerCreditMovementKind;

  @Field({ description: 'Libellé du reçu d’avance, ou de la facture réglée.' })
  label!: string;

  @Field(() => ClubPaymentMethod, {
    nullable: true,
    description: 'Moyen de versement d’une avance ; null pour une utilisation.',
  })
  method!: ClubPaymentMethod | null;

  @Field(() => Int, {
    description:
      'Effet sur le crédit : positif s’il l’augmente, négatif s’il le diminue.',
  })
  amountCents!: number;

  @Field(() => Date)
  createdAt!: Date;
}

/**
 * Crédit du compte connecté (ADR-0022, lot 3). Sans référence de paiement :
 * numéros de chèque et identifiants Stripe restent au club.
 */
@ObjectType()
export class ViewerPayerCreditGraph {
  @Field(() => Int, {
    description:
      'Crédit disponible. Négatif : à régulariser auprès du club, il ne règle rien.',
  })
  balanceCents!: number;

  @Field(() => [ViewerPayerCreditMovementGraph], {
    description: 'Du plus récent au plus ancien.',
  })
  movements!: ViewerPayerCreditMovementGraph[];
}
