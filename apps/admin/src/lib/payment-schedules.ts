/**
 * Échéanciers vus du back-office : libellés et calculs d'affichage.
 *
 * Les règles métier (mois en retard, échéances qu'un règlement au club peut
 * solder) viennent de l'API (`overdue`, `settleableByPayment`) : ce fichier
 * ne les redéfinit pas, il les lit.
 */

export type PaymentScheduleMethodStr =
  'CARD' | 'SEPA_DEBIT' | 'MANUAL_TRANSFER';

export type PaymentScheduleStatusStr =
  'PENDING_SETUP' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type PaymentScheduleInstallmentStatusStr =
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'REQUIRES_ACTION'
  | 'PAID'
  | 'FAILED_RETRYABLE'
  | 'FAILED_FINAL'
  | 'CANCELLED';

export type AdminPaymentScheduleInstallment = {
  id: string;
  seq: number;
  dueOn: string;
  amountCents: number;
  status: PaymentScheduleInstallmentStatusStr;
  overdue: boolean;
  settleableByPayment: boolean;
};

export type AdminPaymentSchedule = {
  id: string;
  invoiceId: string;
  invoiceLabel: string;
  invoiceStatus: 'DRAFT' | 'OPEN' | 'PAID' | 'VOID';
  payerLabel: string | null;
  method: PaymentScheduleMethodStr;
  status: PaymentScheduleStatusStr;
  totalCents: number;
  installmentCount: number;
  paidCount: number;
  paidCents: number;
  remainingCents: number;
  overdueCount: number;
  overdueCents: number;
  nextDueOn: string | null;
  nextDueCents: number | null;
  createdAt: string;
  installments: AdminPaymentScheduleInstallment[];
};

export type ClubPaymentSchedulesQueryData = {
  clubPaymentSchedules: AdminPaymentSchedule[];
};

export type ClubInvoicePaymentScheduleQueryData = {
  clubInvoicePaymentSchedule: AdminPaymentSchedule | null;
};

export const SCHEDULE_METHOD_LABELS: Record<PaymentScheduleMethodStr, string> =
  {
    CARD: 'Carte',
    SEPA_DEBIT: 'Prélèvement SEPA',
    MANUAL_TRANSFER: 'Virement mensuel',
  };

/**
 * Statut lisible : « en attente de carte » dit au trésorier que rien n'est
 * prélevé, et que la famille règle au club tant qu'elle n'a pas de carte.
 */
export function scheduleStatusLabel(
  status: PaymentScheduleStatusStr,
  method: PaymentScheduleMethodStr,
): string {
  switch (status) {
    case 'PENDING_SETUP':
      return method === 'SEPA_DEBIT'
        ? 'Mandat non signé — rien n’est prélevé'
        : 'Carte non enregistrée — rien n’est prélevé';
    case 'ACTIVE':
      return method === 'MANUAL_TRANSFER'
        ? 'Virement chaque mois par la famille'
        : 'Prélevé automatiquement';
    case 'COMPLETED':
      return 'Terminé';
    case 'CANCELLED':
      return 'Interrompu';
  }
}

export const INSTALLMENT_STATUS_LABELS: Record<
  PaymentScheduleInstallmentStatusStr,
  string
> = {
  SCHEDULED: 'À venir',
  PROCESSING: 'Prélèvement en cours',
  REQUIRES_ACTION: 'Authentification attendue',
  PAID: 'Payée',
  FAILED_RETRYABLE: 'Échec — nouvel essai prévu',
  FAILED_FINAL: 'Échec définitif',
  CANCELLED: 'Annulée',
};

/**
 * Mois d'une échéance (« novembre 2026 »). `dueOn` est une date sans heure
 * (minuit UTC) : la lire en heure locale la ferait reculer d'un jour à l'ouest
 * de Greenwich.
 */
export function installmentMonthLabel(dueOn: string): string {
  return new Date(dueOn).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Date d'exigibilité (« 10 nov. 2026 »), lue sans décalage de fuseau. */
export function installmentDueLabel(dueOn: string): string {
  return new Date(dueOn).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Première échéance qu'un règlement au club solderait, ou null. */
export function firstSettleableInstallment(
  schedule: AdminPaymentSchedule | null,
): AdminPaymentScheduleInstallment | null {
  return schedule?.installments.find((i) => i.settleableByPayment) ?? null;
}

export type SettlementPreview =
  | { kind: 'none' }
  | { kind: 'closes' }
  | { kind: 'months'; months: string[]; leftoverCents: number }
  | { kind: 'partial' };

/**
 * Ce qu'un règlement de `amountCents` va solder sur une facture échelonnée.
 *
 * Même parcours que `settleEarliestInstallments` côté API : les échéances
 * soldables, par rang croissant, chacune seulement si le reste du règlement la
 * couvre en entier. Un règlement qui couvre tout le reste dû solde la facture
 * et termine l'échéancier.
 */
export function previewSettlement(
  schedule: AdminPaymentSchedule | null,
  amountCents: number,
  invoiceBalanceCents: number,
): SettlementPreview {
  if (!schedule || amountCents <= 0) return { kind: 'none' };
  if (amountCents >= invoiceBalanceCents) return { kind: 'closes' };
  let left = amountCents;
  const months: string[] = [];
  for (const inst of schedule.installments) {
    if (!inst.settleableByPayment) continue;
    if (inst.amountCents > left) break;
    left -= inst.amountCents;
    months.push(installmentMonthLabel(inst.dueOn));
  }
  if (months.length === 0) {
    return schedule.installments.some((i) => i.settleableByPayment)
      ? { kind: 'partial' }
      : { kind: 'none' };
  }
  return { kind: 'months', months, leftoverCents: left };
}
