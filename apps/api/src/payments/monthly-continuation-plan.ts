/**
 * Suite d'une cotisation au rythme mensuel : quels mois restent à facturer,
 * et quand les prélever.
 *
 * Module PUR : aucune I/O. La facture d'adhésion d'une cotisation mensuelle
 * ne porte que le PREMIER mois ; les suivants, jusqu'à la fin de la saison,
 * font l'objet d'une seconde facture réglée par un échéancier carte. Ce
 * module en fixe le calendrier — c'est là qu'une erreur coûte (un mois
 * oublié, ou prélevé deux fois).
 */

import type { PlannedInstallment } from './payment-schedule-plan';

/** Jour du mois où partent les mensualités. */
export const MONTHLY_CHARGE_DAY = 10;

/** Un mois civil. `month` en base 0, façon `Date`. */
export type YearMonth = { year: number; month: number };

/** Une date civile (jour compris), sans heure ni fuseau. */
type YearMonthDay = YearMonth & { day: number };

function ymIndex(ym: YearMonth): number {
  return ym.year * 12 + ym.month;
}

function ymFromIndex(index: number): YearMonth {
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
}

/** Date civile d'un instant dans un fuseau donné. */
export function dateInZone(date: Date, timeZone: string): YearMonthDay {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month') - 1, day: get('day') };
}

/** Mois d'une colonne `@db.Date` (stockée à minuit UTC). */
export function yearMonthOfDateOnly(date: Date): YearMonth {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

/**
 * Mois que couvre la cotisation de la facture d'adhésion.
 *
 * C'est le mois de l'adhésion, sans jamais remonter avant le début de la
 * saison : une adhésion prise en août pour la saison qui commence en
 * septembre couvre septembre.
 */
export function firstCoveredMonth(args: {
  seasonStartsOn: Date;
  adheredAt: Date;
  timeZone: string;
}): YearMonth {
  const season = yearMonthOfDateOnly(args.seasonStartsOn);
  const adhered = dateInZone(args.adheredAt, args.timeZone);
  return ymIndex(adhered) > ymIndex(season)
    ? { year: adhered.year, month: adhered.month }
    : season;
}

/**
 * Mois restant à facturer : du mois qui suit le mois couvert jusqu'au mois de
 * fin de saison inclus. Vide si la saison se termine avec le mois couvert.
 */
export function remainingMonths(args: {
  firstCovered: YearMonth;
  seasonEndsOn: Date;
}): YearMonth[] {
  const from = ymIndex(args.firstCovered) + 1;
  const to = ymIndex(yearMonthOfDateOnly(args.seasonEndsOn));
  const months: YearMonth[] = [];
  for (let i = from; i <= to; i += 1) months.push(ymFromIndex(i));
  return months;
}

/**
 * Plan des mensualités : une par mois, toutes du même montant.
 *
 * Un mois déjà entamé — ou passé — est exigible tout de suite (`today`) :
 * c'est un mois que l'adhérent doit déjà. Les mois à venir partent le
 * `chargeDay` du mois. Le moteur prélevant toute échéance dont la date est
 * atteinte, une mensualité exigible aujourd'hui part dès que l'échéancier est
 * prélevable.
 *
 * @param today date civile du jour dans le fuseau du club
 */
export function buildMonthlyContinuationPlan(args: {
  monthlyCents: number;
  months: YearMonth[];
  today: { year: number; month: number; day: number };
  chargeDay?: number;
}): PlannedInstallment[] {
  if (!Number.isInteger(args.monthlyCents) || args.monthlyCents <= 0) {
    throw new Error('La mensualité doit être un entier positif de centimes.');
  }
  const chargeDay = args.chargeDay ?? MONTHLY_CHARGE_DAY;
  if (!Number.isInteger(chargeDay) || chargeDay < 1 || chargeDay > 28) {
    // Au-delà du 28, février n'aurait pas d'échéance.
    throw new Error('Le jour de prélèvement doit être compris entre 1 et 28.');
  }
  const todayIndex = ymIndex(args.today);
  const todayDate = new Date(
    Date.UTC(args.today.year, args.today.month, args.today.day),
  );

  return args.months.map((ym, i) => ({
    seq: i + 1,
    dueOn:
      ymIndex(ym) <= todayIndex
        ? todayDate
        : new Date(Date.UTC(ym.year, ym.month, chargeDay)),
    amountCents: args.monthlyCents,
  }));
}

const MONTH_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** « octobre 2026 ». */
export function formatYearMonth(ym: YearMonth): string {
  return MONTH_FORMAT.format(new Date(Date.UTC(ym.year, ym.month, 1)));
}

/** Libellé de la facture des mensualités. */
export function continuationLabel(args: {
  months: YearMonth[];
  payerLabel: string | null;
}): string {
  const first = args.months[0];
  const last = args.months[args.months.length - 1];
  if (!first || !last) throw new Error('Aucun mois à facturer.');
  const span =
    args.months.length === 1
      ? formatYearMonth(first)
      : `${formatYearMonth(first)} à ${formatYearMonth(last)}`;
  return `Cotisation mensuelle — ${span}` +
    (args.payerLabel ? ` — ${args.payerLabel}` : '');
}

/**
 * Accord affiché sur la page de paiement de la facture d'adhésion, quand la
 * carte y est enregistrée pour les mois suivants. Il doit dire précisément ce
 * qui sera débité : c'est cet accord qui autorise les débits sans que
 * l'adhérent soit présent.
 */
export function monthlyConsentText(args: {
  clubName: string;
  monthlyCents: number;
  months: YearMonth[];
  today: YearMonth;
  chargeDay?: number;
}): string {
  if (args.months.length === 0) throw new Error('Aucun mois à facturer.');
  const amount = formatEuros(args.monthlyCents);
  const day = args.chargeDay ?? MONTHLY_CHARGE_DAY;
  // Mêmes règles que `buildMonthlyContinuationPlan` : un mois entamé est
  // débité tout de suite, les suivants le jour fixe.
  const now = args.months.filter((m) => ymIndex(m) <= ymIndex(args.today));
  const later = args.months.filter((m) => ymIndex(m) > ymIndex(args.today));

  const parts: string[] = [];
  if (now.length > 0) {
    parts.push(
      `${formatEuros(args.monthlyCents * now.length)} € dès aujourd'hui ` +
        `pour ${now.map(formatYearMonth).join(', ')}`,
    );
  }
  if (later.length > 0) {
    const first = later[0]!;
    const last = later[later.length - 1]!;
    const span =
      later.length === 1
        ? `en ${formatYearMonth(first)}`
        : `de ${formatYearMonth(first)} à ${formatYearMonth(last)}`;
    parts.push(`${amount} € le ${day} de chaque mois ${span}`);
  }
  const count = args.months.length;
  return (
    `Cotisation mensuelle : en payant, vous autorisez ${args.clubName} à ` +
    `débiter ensuite cette carte de ${parts.join(', puis ')} ` +
    `(${count} mensualité${count > 1 ? 's' : ''}), sans nouvelle validation.`
  );
}

function formatEuros(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}
