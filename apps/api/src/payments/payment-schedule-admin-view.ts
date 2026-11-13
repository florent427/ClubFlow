import {
  PaymentScheduleInstallmentStatus as InstallmentStatus,
  PaymentScheduleStatus,
} from '@prisma/client';

/**
 * Échéances qu'un règlement saisi hors échéancier (espèces, chèque, virement,
 * avance) peut solder, dans l'ordre de leur rang.
 *
 * Source UNIQUE de cette règle : `settleEarliestInstallments` (le moteur) et la
 * vue admin (qui annonce au trésorier le mois que son règlement va payer) la
 * lisent toutes les deux. Une échéance en cours de prélèvement (PROCESSING)
 * n'est jamais prise ; une échéance en échec définitif (FAILED_FINAL) non plus.
 */
export const MANUALLY_SETTLEABLE_INSTALLMENT_STATUSES: readonly InstallmentStatus[] =
  [
    InstallmentStatus.SCHEDULED,
    InstallmentStatus.FAILED_RETRYABLE,
    InstallmentStatus.REQUIRES_ACTION,
  ];

/** Échéanciers dont un règlement hors échéancier solde encore des échéances. */
export const MANUALLY_SETTLEABLE_SCHEDULE_STATUSES: readonly PaymentScheduleStatus[] =
  [PaymentScheduleStatus.ACTIVE, PaymentScheduleStatus.PENDING_SETUP];

/** Échéances encore dues : ni encaissées, ni annulées. */
const UNPAID_STATUSES: ReadonlySet<InstallmentStatus> = new Set([
  InstallmentStatus.SCHEDULED,
  InstallmentStatus.PROCESSING,
  InstallmentStatus.REQUIRES_ACTION,
  InstallmentStatus.FAILED_RETRYABLE,
  InstallmentStatus.FAILED_FINAL,
]);

/** Une date civile (mois de 0 à 11), sans heure ni fuseau. */
export type CivilDate = { year: number; month: number; day: number };

type InstallmentRow = {
  id: string;
  seq: number;
  dueOn: Date;
  amountCents: number;
  status: InstallmentStatus;
};

export type AdminInstallmentView = InstallmentRow & {
  overdue: boolean;
  settleableByPayment: boolean;
};

export type AdminScheduleSummary = {
  installments: AdminInstallmentView[];
  paidCount: number;
  paidCents: number;
  remainingCents: number;
  overdueCount: number;
  overdueCents: number;
  nextDueOn: Date | null;
  nextDueCents: number | null;
};

/** Clé comparable d'une colonne `@db.Date` (stockée à minuit UTC). */
function dateOnlyKey(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Ce que le trésorier doit lire d'un échéancier : mois payés, mois en retard,
 * prochaine échéance, et les échéances qu'un règlement saisi au club solderait.
 *
 * En retard = encore due, et exigible AVANT aujourd'hui (fuseau du club) :
 * une échéance du jour n'est pas en retard, le moteur la prélève dans la
 * journée. Une échéance en cours de prélèvement n'est pas en retard non plus.
 */
export function summarizeSchedule(
  schedule: { status: PaymentScheduleStatus; installments: InstallmentRow[] },
  today: CivilDate,
): AdminScheduleSummary {
  const todayKey = Date.UTC(today.year, today.month, today.day);
  const scheduleSettleable = MANUALLY_SETTLEABLE_SCHEDULE_STATUSES.includes(
    schedule.status,
  );
  const sorted = [...schedule.installments].sort((a, b) => a.seq - b.seq);

  const installments = sorted.map((inst) => {
    const unpaid = UNPAID_STATUSES.has(inst.status);
    return {
      ...inst,
      overdue:
        unpaid &&
        inst.status !== InstallmentStatus.PROCESSING &&
        dateOnlyKey(inst.dueOn) < todayKey,
      settleableByPayment:
        scheduleSettleable &&
        MANUALLY_SETTLEABLE_INSTALLMENT_STATUSES.includes(inst.status),
    };
  });

  const paid = installments.filter((i) => i.status === InstallmentStatus.PAID);
  const unpaid = installments.filter((i) => UNPAID_STATUSES.has(i.status));
  const overdue = installments.filter((i) => i.overdue);
  const next = unpaid.find((i) => !i.overdue) ?? null;
  const sum = (rows: InstallmentRow[]) =>
    rows.reduce((s, i) => s + i.amountCents, 0);

  return {
    installments,
    paidCount: paid.length,
    paidCents: sum(paid),
    remainingCents: sum(unpaid),
    overdueCount: overdue.length,
    overdueCents: sum(overdue),
    nextDueOn: next?.dueOn ?? null,
    nextDueCents: next?.amountCents ?? null,
  };
}
