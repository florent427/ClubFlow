/**
 * Construction d'un plan d'échéances (cf. ADR-0009).
 *
 * Module PUR : aucune I/O, aucune dépendance Nest. Toute la logique
 * arithmétique et calendaire vit ici pour être testable isolément — c'est
 * l'endroit où une erreur coûte le plus cher (montant qui ne tombe pas juste,
 * échéance qui saute un mois).
 */

/**
 * Délai minimal, en jours, entre la signature d'un mandat SEPA et le premier
 * prélèvement.
 *
 * Le schéma SEPA impose d'informer le débiteur avant de le prélever. L'avis
 * partant à la signature du mandat, ce délai garantit qu'il la précède
 * réellement. Il est volontairement court : pour un échéancier fixe, un avis
 * unique listant toutes les échéances couvre l'obligation, il ne s'agit donc
 * pas d'appliquer les 14 jours du préavis standard.
 */
export const SEPA_PRENOTIFICATION_DAYS = 2;

export type PlannedInstallment = {
  /** Rang dans l'échéancier, de 1 à N. */
  seq: number;
  /** Date d'exigibilité, normalisée à minuit UTC (colonne `@db.Date`). */
  dueOn: Date;
  amountCents: number;
};

/**
 * Découpe un montant en `count` parts entières de centimes.
 *
 * INVARIANT : la somme des parts est exactement égale à `totalCents`.
 * Le reliquat de la division est absorbé par la DERNIÈRE échéance (ADR-0009),
 * ce qui la rend au plus `count - 1` centimes plus élevée que les autres.
 *
 * Exemple : 100,00 € en 3 fois → 33,33 + 33,33 + 33,34.
 */
export function splitAmountIntoInstallments(
  totalCents: number,
  count: number,
): number[] {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new Error('Le montant à échelonner doit être un entier positif.');
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Le nombre d'échéances doit être un entier >= 1.");
  }
  if (count > totalCents) {
    // Sinon certaines échéances vaudraient 0 centime, ce qui n'a pas de sens
    // et ferait échouer le prélèvement côté Stripe (montant minimum).
    throw new Error(
      "Le nombre d'échéances dépasse le montant : certaines seraient nulles.",
    );
  }

  const base = Math.floor(totalCents / count);
  const parts = new Array<number>(count).fill(base);
  parts[count - 1] = totalCents - base * (count - 1);
  return parts;
}

/**
 * Dernier jour du mois donné (année/mois en base 0, façon `Date`).
 * `Date.UTC(y, m + 1, 0)` renvoie le jour 0 du mois suivant, c'est-à-dire le
 * dernier jour du mois courant — y compris pour février bissextile.
 */
function lastDayOfMonthUTC(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Ajoute `months` mois à une date, en RABOTANT au dernier jour du mois quand
 * le quantième n'existe pas.
 *
 * Sans ce rabotage, l'arithmétique naïve de `Date` déborde : le 31 janvier
 * + 1 mois donnerait le 3 mars (car « 31 février » est reporté). Une échéance
 * mensuelle prélevée le 31 sauterait donc février, puis dériverait.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();

  const targetMonth = m + months;
  const targetYear = y + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;

  const maxDay = lastDayOfMonthUTC(targetYear, normalizedMonth);
  return new Date(Date.UTC(targetYear, normalizedMonth, Math.min(d, maxDay)));
}

/** Ramène une date à minuit UTC (la colonne `dueOn` est un `@db.Date`). */
export function toDateOnlyUTC(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/**
 * Construit le plan complet : montants + dates d'exigibilité.
 *
 * @param firstDueOn   exigibilité de la 1re échéance (souvent aujourd'hui)
 * @param intervalMonths écart entre deux échéances (1 = mensuel)
 */
export function buildInstallmentPlan(args: {
  totalCents: number;
  count: number;
  firstDueOn: Date;
  intervalMonths?: number;
}): PlannedInstallment[] {
  const interval = args.intervalMonths ?? 1;
  if (!Number.isInteger(interval) || interval < 1) {
    throw new Error("L'intervalle entre échéances doit être un entier >= 1.");
  }

  const amounts = splitAmountIntoInstallments(args.totalCents, args.count);
  const start = toDateOnlyUTC(args.firstDueOn);

  return amounts.map((amountCents, i) => ({
    seq: i + 1,
    // Toujours calculé depuis la date de DÉPART, jamais de proche en proche :
    // un rabotage sur un mois court (28 févr.) ne doit pas contaminer les
    // échéances suivantes, qui doivent revenir au quantième d'origine.
    dueOn: addMonthsClamped(start, i * interval),
    amountCents,
  }));
}
