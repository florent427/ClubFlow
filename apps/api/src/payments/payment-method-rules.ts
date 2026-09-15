import { BadRequestException } from '@nestjs/common';
import { ClubPaymentMethod } from '@prisma/client';

/**
 * Le crédit du payeur ne fait entrer aucun argent (ADR-0022, §6). Il ne se
 * choisit pas comme moyen d'encaissement, ne se verrouille pas sur une facture
 * et ne porte ni tarif ni route vers un compte : il s'impute depuis la facture
 * à régler.
 */
export function assertNotPayerCreditMethod(
  method: ClubPaymentMethod | null | undefined,
  message = 'Le crédit n’est pas un moyen de paiement à choisir : il s’utilise depuis la facture à régler.',
): void {
  if (method === ClubPaymentMethod.PAYER_CREDIT) {
    throw new BadRequestException(message);
  }
}
