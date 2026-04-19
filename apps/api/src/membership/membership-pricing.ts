import {
  InvoiceLineAdjustmentType,
  PricingAdjustmentType,
} from '@prisma/client';

export type AdjustmentDraft = {
  stepOrder: number;
  type: InvoiceLineAdjustmentType;
  amountCents: number;
  percentAppliedBp?: number | null;
  metadataJson?: string | null;
  reason?: string | null;
};

/** Jours calendaires entre deux dates (borne à borne), minimum 1 si a <= b. */
export function inclusiveCalendarDays(a: Date, b: Date): number {
  const ms = 86_400_000;
  const ta = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const tb = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  if (tb < ta) {
    return 0;
  }
  return Math.floor((tb - ta) / ms) + 1;
}

/**
 * Part de saison restant à payer en points de base (10_000 = 100 %).
 * Granularité au mois plein : la date d’effet est ramenée au 1er du mois,
 * la fin de saison au dernier jour de son mois. Date d’effet bornée à
 * [startsOn, endsOn].
 */
export function computeProrataFactorBp(
  effectiveDate: Date,
  seasonStart: Date,
  seasonEnd: Date,
): number {
  const start = stripTime(seasonStart);
  const end = stripTime(seasonEnd);
  let eff = stripTime(effectiveDate);
  if (eff < start) {
    eff = start;
  }
  if (eff > end) {
    return 0;
  }
  const totalMonths = inclusiveCalendarMonths(start, end);
  if (totalMonths < 1) {
    return 10_000;
  }
  const effMonthStart = new Date(
    Date.UTC(eff.getUTCFullYear(), eff.getUTCMonth(), 1),
  );
  const remainingMonths = inclusiveCalendarMonths(effMonthStart, end);
  return Math.min(
    10_000,
    Math.max(0, Math.round((remainingMonths * 10_000) / totalMonths)),
  );
}

/** Nombre de mois calendaires couverts entre a et b (inclus), min 0. */
export function inclusiveCalendarMonths(a: Date, b: Date): number {
  const ay = a.getUTCFullYear();
  const am = a.getUTCMonth();
  const by = b.getUTCFullYear();
  const bm = b.getUTCMonth();
  const diff = (by - ay) * 12 + (bm - am) + 1;
  return diff < 0 ? 0 : diff;
}

function stripTime(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function applyClubAdjustmentToSubtotal(
  subtotalCents: number,
  adjustmentType: PricingAdjustmentType,
  adjustmentValue: number,
): number {
  if (subtotalCents < 0) {
    return 0;
  }
  switch (adjustmentType) {
    case 'NONE':
      return subtotalCents;
    case 'PERCENT_BP': {
      const factor = 1 + adjustmentValue / 10_000;
      return Math.max(0, Math.round(subtotalCents * factor));
    }
    case 'FIXED_CENTS':
      return Math.max(0, subtotalCents + adjustmentValue);
    default:
      return subtotalCents;
  }
}

export type MembershipPricingInput = {
  baseAmountCents: number;
  allowProrata: boolean;
  allowFamily: boolean;
  allowPublicAid: boolean;
  allowExceptional: boolean;
  exceptionalCapPercentBp: number | null;
  prorataFactorBp: number;
  /** Règle club pour remise famille ; null = pas de remise */
  familyRule: {
    fromNth: number;
    adjustmentType: PricingAdjustmentType;
    adjustmentValue: number;
  } | null;
  /** Nombre de lignes d’adhésion déjà facturées (OPEN/PAID) pour ce foyer sur la saison, hors facture courante. */
  priorFamilyMembershipCount: number;
  publicAid?: {
    amountCents: number;
    metadata: Record<string, unknown>;
  } | null;
  exceptional?: {
    amountCents: number;
    reason: string;
  } | null;
};

/**
 * Construit les ajustements dans l’ordre : prorata → famille → aide publique → exceptionnelle.
 * Les montants d’ajustement sont des deltas (négatifs = réduction du brut) sauf prorata (peut être négatif vs base).
 */
export function computeMembershipAdjustments(
  input: MembershipPricingInput,
): { adjustments: AdjustmentDraft[]; subtotalAfterBusinessCents: number } {
  const adjustments: AdjustmentDraft[] = [];
  let step = 0;
  let running = input.baseAmountCents;

  if (input.allowProrata) {
    const factor = Math.min(10_000, Math.max(0, input.prorataFactorBp));
    const after = Math.max(0, Math.round((input.baseAmountCents * factor) / 10_000));
    const delta = after - input.baseAmountCents;
    adjustments.push({
      stepOrder: step++,
      type: 'PRORATA_SEASON',
      amountCents: delta,
      percentAppliedBp: factor,
    });
    running = after;
  }

  if (
    input.allowFamily &&
    input.familyRule &&
    input.priorFamilyMembershipCount >= input.familyRule.fromNth - 1
  ) {
    const before = running;
    const afterFam = applyClubAdjustmentToSubtotal(
      running,
      input.familyRule.adjustmentType,
      input.familyRule.adjustmentValue,
    );
    const delta = afterFam - before;
    adjustments.push({
      stepOrder: step++,
      type: 'FAMILY',
      amountCents: delta,
    });
    running = afterFam;
  }

  if (input.allowPublicAid && input.publicAid && input.publicAid.amountCents !== 0) {
    const amt = input.publicAid.amountCents;
    adjustments.push({
      stepOrder: step++,
      type: 'PUBLIC_AID',
      amountCents: amt,
      metadataJson: JSON.stringify(input.publicAid.metadata),
    });
    running = Math.max(0, running + amt);
  }

  if (
    input.allowExceptional &&
    input.exceptional &&
    input.exceptional.amountCents !== 0
  ) {
    let ex = input.exceptional.amountCents;
    if (input.exceptionalCapPercentBp != null && input.exceptionalCapPercentBp > 0) {
      const cap = Math.round((running * input.exceptionalCapPercentBp) / 10_000);
      if (ex < -cap) {
        ex = -cap;
      }
    }
    adjustments.push({
      stepOrder: step++,
      type: 'EXCEPTIONAL',
      amountCents: ex,
      reason: input.exceptional.reason,
    });
    running = Math.max(0, running + ex);
  }

  return { adjustments, subtotalAfterBusinessCents: running };
}

export type OneTimeFeePricingInput = {
  baseAmountCents: number;
  allowExceptional: boolean;
  exceptionalCapPercentBp: number | null;
  exceptional?: {
    amountCents: number;
    reason: string;
  } | null;
};

/**
 * Ajustements pour une ligne « frais unique » : au plus une remise EXCEPTIONAL.
 */
export function computeOneTimeFeeAdjustments(
  input: OneTimeFeePricingInput,
): { adjustments: AdjustmentDraft[]; subtotalAfterBusinessCents: number } {
  const adjustments: AdjustmentDraft[] = [];
  let running = input.baseAmountCents;

  if (
    input.allowExceptional &&
    input.exceptional &&
    input.exceptional.amountCents !== 0
  ) {
    let ex = input.exceptional.amountCents;
    if (
      input.exceptionalCapPercentBp != null &&
      input.exceptionalCapPercentBp > 0
    ) {
      const cap = Math.round(
        (running * input.exceptionalCapPercentBp) / 10_000,
      );
      if (ex < -cap) {
        ex = -cap;
      }
    }
    adjustments.push({
      stepOrder: 0,
      type: 'EXCEPTIONAL',
      amountCents: ex,
      reason: input.exceptional.reason,
    });
    running = Math.max(0, running + ex);
  }

  return { adjustments, subtotalAfterBusinessCents: running };
}
