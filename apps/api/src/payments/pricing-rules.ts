import type { ClubPaymentMethod, ClubPricingRule } from '@prisma/client';

/**
 * Montant final en centimes après application de la règle club pour le mode de paiement.
 * PERCENT_BP : points de base (100 = 1 %), peut être négatif pour une remise.
 */
export function applyPricing(
  baseAmountCents: number,
  method: ClubPaymentMethod,
  ruleRow: ClubPricingRule | null,
): number {
  if (baseAmountCents < 0) {
    throw new Error('Montant de base invalide');
  }
  if (!ruleRow || ruleRow.method !== method) {
    return baseAmountCents;
  }
  switch (ruleRow.adjustmentType) {
    case 'NONE':
      return baseAmountCents;
    case 'PERCENT_BP': {
      const factor = 1 + ruleRow.adjustmentValue / 10_000;
      return Math.max(0, Math.round(baseAmountCents * factor));
    }
    case 'FIXED_CENTS':
      return Math.max(0, baseAmountCents + ruleRow.adjustmentValue);
    default:
      return baseAmountCents;
  }
}
