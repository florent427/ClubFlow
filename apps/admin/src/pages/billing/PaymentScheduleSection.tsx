import {
  INSTALLMENT_STATUS_LABELS,
  SCHEDULE_METHOD_LABELS,
  installmentDueLabel,
  installmentMonthLabel,
  scheduleStatusLabel,
  type AdminPaymentSchedule,
  type AdminPaymentScheduleInstallment,
  type SettlementPreview,
} from '../../lib/payment-schedules';

function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  });
}

function installmentPill(i: AdminPaymentScheduleInstallment) {
  if (i.status === 'PAID') {
    return <span className="cf-pill cf-pill--ok">Payée</span>;
  }
  if (i.overdue) {
    return <span className="cf-pill cf-pill--danger">En retard</span>;
  }
  if (i.status === 'CANCELLED') {
    return <span className="cf-pill">Annulée</span>;
  }
  if (i.status === 'SCHEDULED') {
    return <span className="cf-pill cf-pill--draft">À venir</span>;
  }
  return (
    <span className="cf-pill cf-pill--warn">
      {INSTALLMENT_STATUS_LABELS[i.status]}
    </span>
  );
}

/** Pastille du statut d'un échéancier (liste et fiche). */
export function ScheduleStatusPill({
  schedule,
}: {
  schedule: AdminPaymentSchedule;
}) {
  const cls =
    schedule.status === 'PENDING_SETUP'
      ? 'cf-pill cf-pill--warn'
      : schedule.status === 'ACTIVE'
        ? 'cf-pill cf-pill--info'
        : schedule.status === 'COMPLETED'
          ? 'cf-pill cf-pill--ok'
          : 'cf-pill';
  return (
    <span className={cls}>
      {scheduleStatusLabel(schedule.status, schedule.method)}
    </span>
  );
}

/**
 * Échéancier d'une facture, mois par mois, dans la fiche facture.
 *
 * Le trésorier y lit ce que le « Reste dû » global ne dit pas : la famille
 * paie au mois, tels mois sont réglés, tel mois est en retard, et la carte
 * est (ou non) enregistrée.
 */
export function PaymentScheduleSection({
  schedule,
}: {
  schedule: AdminPaymentSchedule;
}) {
  return (
    <section className="cf-invoice-detail__section" aria-label="Échéancier">
      <h3 className="cf-invoice-detail__section-title">
        Échéancier · {schedule.installmentCount} mensualités
      </h3>
      <div className="cf-schedule__summary">
        <span>{SCHEDULE_METHOD_LABELS[schedule.method]}</span>
        <ScheduleStatusPill schedule={schedule} />
        <span>
          {schedule.paidCount}/{schedule.installmentCount} payées ·{' '}
          {formatEuros(schedule.paidCents)} réglés
        </span>
        {schedule.overdueCount > 0 ? (
          <span className="cf-cell-danger">
            {schedule.overdueCount} en retard (
            {formatEuros(schedule.overdueCents)})
          </span>
        ) : null}
      </div>
      {schedule.status === 'PENDING_SETUP' ? (
        <p className="cf-invoice-detail__empty" style={{ marginTop: 0 }}>
          Rien n’est prélevé tant que la famille n’a pas enregistré sa carte. Un
          règlement saisi ici (espèces, chèque, virement, crédit) paie la plus
          ancienne mensualité due.
        </p>
      ) : null}
      <ol className="cf-schedule__list">
        {schedule.installments.map((i) => (
          <li
            key={i.id}
            className={`cf-schedule__row${i.overdue ? ' cf-schedule__row--overdue' : ''}`}
          >
            <span className="cf-schedule__month">
              {installmentMonthLabel(i.dueOn)}
            </span>
            <span className="cf-schedule__due">
              dû le {installmentDueLabel(i.dueOn)}
            </span>
            <span className="cf-schedule__amount">
              {formatEuros(i.amountCents)}
            </span>
            {installmentPill(i)}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Ce que le règlement en cours de saisie va payer, sur une facture échelonnée. */
export function SettlementHint({ preview }: { preview: SettlementPreview }) {
  if (preview.kind === 'none') return null;
  let text: string;
  if (preview.kind === 'closes') {
    text =
      'Ce règlement solde la facture : toutes les mensualités restantes sont réglées.';
  } else if (preview.kind === 'partial') {
    text =
      'Ce montant ne couvre pas une mensualité entière : aucun mois ne sera marqué payé.';
  } else {
    text = `Ce règlement paie : ${preview.months.join(', ')}.`;
    if (preview.leftoverCents > 0) {
      text += ` Les ${formatEuros(preview.leftoverCents)} restants ne couvrent pas la mensualité suivante.`;
    }
  }
  return (
    <p className="cf-field__hint cf-schedule__hint" role="status">
      {text}
    </p>
  );
}
