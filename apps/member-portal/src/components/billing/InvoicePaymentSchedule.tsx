import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import {
  VIEWER_CREATE_PAYMENT_SCHEDULE,
  VIEWER_INVOICE_PAYMENT_SCHEDULE,
  VIEWER_START_PAYMENT_SCHEDULE_SETUP,
} from '../../lib/viewer-documents';
import type {
  PaymentScheduleInstallmentStatus,
  PaymentScheduleMethod,
  PaymentScheduleStatus,
  ViewerCreatePaymentScheduleData,
  ViewerInvoicePaymentScheduleData,
  ViewerPaymentSchedule,
  ViewerStartPaymentScheduleSetupData,
} from '../../lib/viewer-types';
import { formatEuroCents } from '../../lib/format';
import { LoadingState } from '../ui/LoadingState';
import { ErrorState } from '../ui/ErrorState';
import { useToast } from '../ToastProvider';

/** Bornes du contrat GraphQL : 2 à 12 échéances. */
const MIN_INSTALLMENTS = 2;
const MAX_INSTALLMENTS = 12;

/** Libellés adhérent (aucun jargon technique). */
function installmentStatusLabel(
  status: PaymentScheduleInstallmentStatus,
): string {
  switch (status) {
    case 'SCHEDULED':
      return 'À venir';
    case 'PROCESSING':
      return 'En cours';
    case 'REQUIRES_ACTION':
      return 'Action requise';
    case 'PAID':
      return 'Payée';
    case 'FAILED_RETRYABLE':
      return 'Échec, nouvelle tentative prévue';
    case 'FAILED_FINAL':
      return 'Échec';
    case 'CANCELLED':
      return 'Annulée';
    default:
      return status;
  }
}

/** Variante visuelle du badge, alignée sur les classes existantes. */
function installmentBadgeModifier(
  status: PaymentScheduleInstallmentStatus,
): string {
  switch (status) {
    case 'PAID':
      return 'mp-badge--success';
    case 'PROCESSING':
      return 'mp-badge--info';
    case 'REQUIRES_ACTION':
    case 'FAILED_RETRYABLE':
      return 'mp-badge--warning';
    case 'FAILED_FINAL':
      return 'mp-badge--danger';
    case 'CANCELLED':
      return 'mp-badge--muted';
    default:
      return 'mp-badge--neutral';
  }
}

function scheduleStatusLabel(status: PaymentScheduleStatus): string {
  switch (status) {
    case 'PENDING_SETUP':
      return 'En attente de votre moyen de paiement';
    case 'ACTIVE':
      return 'En cours';
    case 'COMPLETED':
      return 'Terminé';
    case 'CANCELLED':
      return 'Annulé';
    default:
      return status;
  }
}

function methodLabel(method: PaymentScheduleMethod): string {
  return method === 'CARD' ? 'Carte bancaire' : 'Prélèvement bancaire (SEPA)';
}

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

interface Props {
  /** Facture concernée. */
  invoiceId: string;
  /** Reste à payer, sert d'assiette à la simulation d'échéances. */
  balanceCents: number;
  /** Statut de la facture : seules les factures OPEN peuvent être étalées. */
  invoiceStatus: string;
}

export function InvoicePaymentSchedule({
  invoiceId,
  balanceCents,
  invoiceStatus,
}: Props) {
  const { showToast } = useToast();
  const { data, loading, error, refetch } =
    useQuery<ViewerInvoicePaymentScheduleData>(
      VIEWER_INVOICE_PAYMENT_SCHEDULE,
      {
        variables: { invoiceId },
        errorPolicy: 'all',
        fetchPolicy: 'cache-and-network',
      },
    );

  const [formOpen, setFormOpen] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(3);
  const [method, setMethod] = useState<PaymentScheduleMethod>('CARD');
  const [submitting, setSubmitting] = useState(false);

  const [createSchedule] = useMutation<ViewerCreatePaymentScheduleData>(
    VIEWER_CREATE_PAYMENT_SCHEDULE,
  );
  const [startSetup] = useMutation<ViewerStartPaymentScheduleSetupData>(
    VIEWER_START_PAYMENT_SCHEDULE_SETUP,
  );

  // Simulation locale : n-1 échéances arrondies + un solde ajusté, pour ne
  // jamais afficher un total différent du reste à payer réel.
  const preview = useMemo(() => {
    const base = Math.round(balanceCents / installmentCount);
    return { base, last: balanceCents - base * (installmentCount - 1) };
  }, [balanceCents, installmentCount]);

  async function handleSubmit(): Promise<void> {
    if (submitting) return;
    setSubmitting(true);
    try {
      const created = await createSchedule({
        variables: { invoiceId, method, installmentCount },
      });
      const scheduleId = created.data?.viewerCreatePaymentSchedule.id;
      if (!scheduleId) {
        throw new Error('Échéancier indisponible pour le moment.');
      }
      const session = await startSetup({ variables: { scheduleId } });
      const url = session.data?.viewerStartPaymentScheduleSetup.url;
      if (!url) {
        throw new Error(
          'La page d’enregistrement de votre moyen de paiement est indisponible. Réessayez dans quelques instants.',
        );
      }
      window.location.href = url;
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : 'Le paiement en plusieurs fois est indisponible.';
      showToast(msg, 'error');
      setSubmitting(false);
      // L'échéancier a pu être créé avant l'échec : on resynchronise pour
      // afficher son état plutôt que de reproposer une création.
      void refetch();
    }
  }

  if (loading && !data) {
    return <LoadingState label="Chargement de l’échéancier…" />;
  }

  const schedule = data?.viewerInvoicePaymentSchedule ?? null;

  if (error && !schedule) {
    return (
      <ErrorState
        title="Paiement en plusieurs fois indisponible"
        message={error.message}
        action={
          <button
            type="button"
            className="mp-btn mp-btn-outline mp-btn-sm"
            onClick={() => void refetch()}
          >
            Réessayer
          </button>
        }
      />
    );
  }

  // Un échéancier existe déjà : on affiche son état, pas le formulaire.
  if (schedule) {
    return <ScheduleRecap schedule={schedule} />;
  }

  // Pas d'échéancier : proposition uniquement sur une facture à payer.
  if (invoiceStatus !== 'OPEN' || balanceCents <= 0) {
    return null;
  }

  if (!formOpen) {
    return (
      <div className="mp-subsection">
        <button
          type="button"
          className="mp-btn mp-btn-outline"
          onClick={() => setFormOpen(true)}
        >
          <span className="material-symbols-outlined" aria-hidden>
            calendar_month
          </span>
          Payer en plusieurs fois
        </button>
        <p className="mp-hint mp-invoice-item__tip">
          Étalez le règlement de {formatEuroCents(balanceCents)} sur plusieurs
          mois, par carte bancaire ou par prélèvement sur votre compte.
        </p>
      </div>
    );
  }

  return (
    <div className="mp-subsection">
      <h3 className="mp-invoice-subtitle">Payer en plusieurs fois</h3>
      <p className="mp-hint">
        Reste à payer : <strong>{formatEuroCents(balanceCents)}</strong>.
        Choisissez le nombre de versements et la façon dont ils seront
        prélevés.
      </p>

      <label className="mp-field">
        <span>Nombre d’échéances</span>
        <select
          value={installmentCount}
          onChange={(e) => setInstallmentCount(Number(e.target.value))}
          disabled={submitting}
        >
          {Array.from(
            { length: MAX_INSTALLMENTS - MIN_INSTALLMENTS + 1 },
            (_, i) => MIN_INSTALLMENTS + i,
          ).map((n) => (
            <option key={n} value={n}>
              {n} fois
            </option>
          ))}
        </select>
      </label>

      <p className="mp-hint">
        {preview.base === preview.last
          ? `${installmentCount} versements de ${formatEuroCents(preview.base)}.`
          : `${installmentCount - 1} versements de ${formatEuroCents(preview.base)} puis un dernier de ${formatEuroCents(preview.last)}.`}{' '}
        Le premier versement est prélevé à sa date d’échéance, pas
        aujourd’hui.
      </p>

      <fieldset className="mp-fieldset">
        <legend className="mp-legend">Comment souhaitez-vous être prélevé ?</legend>
        <label className="mp-radio mp-radio--inline">
          <input
            type="radio"
            name={`schedule-method-${invoiceId}`}
            value="CARD"
            checked={method === 'CARD'}
            onChange={() => setMethod('CARD')}
            disabled={submitting}
          />
          <span>Carte bancaire</span>
        </label>
        <label className="mp-radio mp-radio--inline">
          <input
            type="radio"
            name={`schedule-method-${invoiceId}`}
            value="SEPA_DEBIT"
            checked={method === 'SEPA_DEBIT'}
            onChange={() => setMethod('SEPA_DEBIT')}
            disabled={submitting}
          />
          <span>Prélèvement sur mon compte bancaire</span>
        </label>
      </fieldset>

      <p className="mp-hint">
        {method === 'CARD'
          ? 'Vous enregistrerez votre carte sur la page sécurisée de notre prestataire de paiement. Aucun montant n’est débité à ce moment-là : chaque échéance sera prélevée automatiquement à sa date.'
          : 'Vous indiquerez votre IBAN sur la page sécurisée de notre prestataire de paiement et vous signerez une autorisation de prélèvement en faveur du club. Aucun montant n’est débité à ce moment-là : chaque échéance sera prélevée automatiquement à sa date.'}
      </p>

      <div className="mp-form-actions">
        <button
          type="button"
          className="mp-btn mp-btn-outline"
          onClick={() => setFormOpen(false)}
          disabled={submitting}
        >
          Annuler
        </button>
        <button
          type="button"
          className="mp-btn mp-btn-primary"
          onClick={() => void handleSubmit()}
          disabled={submitting}
        >
          {submitting
            ? 'Redirection…'
            : `Enregistrer mon moyen de paiement (${installmentCount} fois)`}
        </button>
      </div>
    </div>
  );
}

/** État d'un échéancier déjà créé + détail des échéances. */
function ScheduleRecap({ schedule }: { schedule: ViewerPaymentSchedule }) {
  const paidCents = schedule.installments
    .filter((i) => i.status === 'PAID')
    .reduce((sum, i) => sum + i.amountCents, 0);

  return (
    <div className="mp-subsection">
      <h3 className="mp-invoice-subtitle">Paiement en plusieurs fois</h3>
      <dl className="mp-invoice-detail-list">
        <div>
          <dt>Formule</dt>
          <dd>
            {schedule.installmentCount} fois ·{' '}
            {methodLabel(schedule.method)}
          </dd>
        </div>
        <div>
          <dt>Montant étalé</dt>
          <dd>{formatEuroCents(schedule.totalCents)}</dd>
        </div>
        <div>
          <dt>Déjà prélevé</dt>
          <dd>{formatEuroCents(paidCents)}</dd>
        </div>
        <div>
          <dt>État</dt>
          <dd>{scheduleStatusLabel(schedule.status)}</dd>
        </div>
      </dl>

      {schedule.status === 'PENDING_SETUP' ? (
        <p className="mp-hint mp-hint--warn">
          Votre moyen de paiement n’est pas encore enregistré : les
          prélèvements ne démarreront qu’une fois cette étape terminée.
        </p>
      ) : null}

      <div className="mp-table-wrap">
        <table className="mp-table">
          <thead>
            <tr>
              <th>Échéance</th>
              <th>Date</th>
              <th className="mp-num">Montant</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {schedule.installments.map((inst) => (
              <tr key={inst.id}>
                <td>
                  {inst.seq} / {schedule.installmentCount}
                </td>
                <td>{formatDueDate(inst.dueOn)}</td>
                <td className="mp-num">{formatEuroCents(inst.amountCents)}</td>
                <td>
                  <span
                    className={`mp-badge ${installmentBadgeModifier(inst.status)}`}
                  >
                    {installmentStatusLabel(inst.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mp-hint mp-invoice-item__tip">
        Les échéances sont prélevées automatiquement à leurs dates. En cas de
        question, contactez le club.
      </p>
    </div>
  );
}
