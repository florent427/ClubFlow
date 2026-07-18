import {
  PaymentScheduleInstallmentStatus,
  PaymentScheduleMethod,
} from '@prisma/client';
import { formatDueDate, formatEuros } from './payment-format';

/**
 * Mention affichée au débiteur juste avant la signature du mandat (cf. ADR-0009).
 *
 * Module PUR : ce texte engage le club sur un montant et des dates, il doit
 * être testable sans Stripe ni base.
 *
 * Raison d'être : le mandat SEPA généré par Stripe nomme comme créancier
 * l'identité DÉCLARÉE AU KYC du compte connecté (raison sociale, libellé de
 * relevé) — correct juridiquement, puisque le créancier doit être l'entité qui
 * détient le compte crédité, mais pas forcément le nom sous lequel l'adhérent
 * connaît son club dans ClubFlow. Un débiteur qui ne reconnaît pas le créancier
 * conteste : le SEPA lui en laisse le droit pendant 8 semaines, sans motif.
 *
 * Cette mention fait donc le pont entre les deux noms et chiffre l'engagement.
 * Elle ne redéfinit PAS le créancier — seul le mandat Stripe fait foi.
 */

/** Longueur maximale d'un `custom_text` Checkout, imposée par Stripe. */
export const CUSTOM_TEXT_MAX = 1200;

/**
 * Statuts d'échéance qui donneront encore lieu à un prélèvement.
 *
 * Aligné sur ce que le moteur accepte de réclamer (SCHEDULED et
 * FAILED_RETRYABLE) plus les états transitoires d'une tentative en cours.
 * PAID, CANCELLED et FAILED_FINAL en sont absents : ils ne seront jamais
 * redébités, les annoncer au débiteur serait mensonger.
 *
 * Liste blanche volontaire plutôt qu'exclusion : si un statut apparaît un jour,
 * mieux vaut l'omettre de l'annonce que de l'annoncer à tort.
 */
export const DEBITABLE_INSTALLMENT_STATUSES: PaymentScheduleInstallmentStatus[] =
  [
    PaymentScheduleInstallmentStatus.SCHEDULED,
    PaymentScheduleInstallmentStatus.FAILED_RETRYABLE,
    PaymentScheduleInstallmentStatus.REQUIRES_ACTION,
    PaymentScheduleInstallmentStatus.PROCESSING,
  ];

export type NoticeInstallment = {
  amountCents: number;
  dueOn: Date;
  status: PaymentScheduleInstallmentStatus;
};

/**
 * Construit la mention, ou `null` s'il n'y a plus rien à prélever.
 *
 * N'annonce QUE ce qui reste dû. `startSetup` est rejouable : un mandat révoqué
 * en cours d'échéancier repasse le plan en PENDING_SETUP (cf.
 * applyMandateUpdated) et l'adhérent resigne alors qu'une partie est déjà
 * payée. Annoncer le plan d'origine lui promettrait des prélèvements pour des
 * sommes qu'il a déjà réglées.
 */
export function buildSetupNotice(args: {
  clubName: string;
  method: PaymentScheduleMethod;
  installments: NoticeInstallment[];
}): string | null {
  const remaining = args.installments
    .filter((i) => DEBITABLE_INSTALLMENT_STATUSES.includes(i.status))
    .sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime());

  if (remaining.length === 0) return null;

  const count = remaining.length;
  const total = remaining.reduce((sum, i) => sum + i.amountCents, 0);
  const firstDue = formatDueDate(remaining[0]!.dueOn);
  const club = args.clubName;

  const message =
    args.method === PaymentScheduleMethod.SEPA_DEBIT
      ? `Échéancier ${club} : ${count} ${plural(count, 'prélèvement')} pour un ` +
        `total de ${formatEuros(total)} €, le premier le ${firstDue}. ` +
        `Le mandat ci-dessous peut désigner ${club} sous sa raison sociale, ` +
        `qui est aussi le libellé qui apparaîtra sur votre relevé bancaire. ` +
        `Le détail des échéances vous est envoyé par e-mail dès la signature. ` +
        `Vous pouvez révoquer ce mandat à tout moment auprès de ${club}.`
      : `Échéancier ${club} : ${count} ${plural(count, 'débit')} sur votre ` +
        `carte pour un total de ${formatEuros(total)} €, le premier le ` +
        `${firstDue}. Aucun montant n'est débité maintenant.`;

  return message.slice(0, CUSTOM_TEXT_MAX);
}

function plural(count: number, word: string): string {
  return count > 1 ? `${word}s` : word;
}
