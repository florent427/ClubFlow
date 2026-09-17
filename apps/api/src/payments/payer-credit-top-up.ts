import { BadRequestException } from '@nestjs/common';
import type { PayerCreditHolderRef } from './payer-credit-holder';

/**
 * « Créditer mon compte » par carte (ADR-0022, lot 3) : une avance versée
 * depuis le portail ou l'appli, sans facture préalable.
 */

/** Montant d'une avance par carte : de 1 € à 1 000 €. */
export const PAYER_CREDIT_TOP_UP_MIN_CENTS = 100;
export const PAYER_CREDIT_TOP_UP_MAX_CENTS = 100_000;

/** Nature portée par la session Stripe, et relue par le webhook. */
export const PAYER_CREDIT_TOP_UP_PURPOSE = 'PAYER_CREDIT_DEPOSIT';

export function assertPayerCreditTopUpAmount(amountCents: number): void {
  if (
    !Number.isInteger(amountCents) ||
    amountCents < PAYER_CREDIT_TOP_UP_MIN_CENTS ||
    amountCents > PAYER_CREDIT_TOP_UP_MAX_CENTS
  ) {
    throw new BadRequestException(
      'Une avance par carte va de 1 € à 1 000 €.',
    );
  }
}

/**
 * Metadata de la session et de son paymentIntent : la personne créditée, son
 * club et le compte connecté attendu. C'est le contrat avec le webhook, qui les
 * relit par `readPayerCreditTopUpMetadata`.
 */
export function payerCreditTopUpMetadata(args: {
  clubId: string;
  ref: PayerCreditHolderRef;
  stripeAccountId: string;
}): Record<string, string> {
  return {
    purpose: PAYER_CREDIT_TOP_UP_PURPOSE,
    clubId: args.clubId,
    ...(args.ref.memberId
      ? { memberId: args.ref.memberId }
      : { contactId: args.ref.contactId as string }),
    stripeAccountId: args.stripeAccountId,
  };
}

/**
 * La personne et le club d'une avance par carte, ou `null` si le paymentIntent
 * n'en est pas une. Une avance sans club, ou qui ne désigne pas exactement une
 * personne, rend `'illisible'` : l'argent est chez le club, l'appelant le
 * signale.
 */
export function readPayerCreditTopUpMetadata(
  metadata: Record<string, string> | null | undefined,
): { clubId: string; ref: PayerCreditHolderRef } | 'illisible' | null {
  if (metadata?.purpose !== PAYER_CREDIT_TOP_UP_PURPOSE) return null;
  const clubId = metadata.clubId?.trim();
  const memberId = metadata.memberId?.trim() || null;
  const contactId = metadata.contactId?.trim() || null;
  if (!clubId || !memberId === !contactId) return 'illisible';
  return { clubId, ref: memberId ? { memberId } : { contactId } };
}
