import { useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { CLUB_PAYMENT_SCHEDULES } from '../../lib/documents';
import {
  SCHEDULE_METHOD_LABELS,
  installmentDueLabel,
  installmentMonthLabel,
  type AdminPaymentSchedule,
  type ClubPaymentSchedulesQueryData,
} from '../../lib/payment-schedules';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { SearchBox } from '../../components/ui/SearchBox';
import { CardList, CardListItem } from '../../components/ui/CardList';
import { useIsMobile } from '../../lib/use-media-query';
import { ScheduleStatusPill } from './PaymentScheduleSection';

function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  });
}

type Filter = 'OPEN' | 'OVERDUE' | 'NO_CARD' | 'TRANSFER' | 'CLOSED';

const FILTER_LABELS: Record<Filter, string> = {
  OPEN: 'En cours',
  OVERDUE: 'En retard',
  NO_CARD: 'Carte non enregistrée',
  TRANSFER: 'Virement mensuel',
  CLOSED: 'Terminés / interrompus',
};

function isOpen(s: AdminPaymentSchedule): boolean {
  return s.status === 'ACTIVE' || s.status === 'PENDING_SETUP';
}

function matches(s: AdminPaymentSchedule, filter: Filter): boolean {
  switch (filter) {
    case 'OPEN':
      return isOpen(s);
    case 'OVERDUE':
      return isOpen(s) && s.overdueCount > 0;
    case 'NO_CARD':
      return s.status === 'PENDING_SETUP';
    case 'TRANSFER':
      return isOpen(s) && s.method === 'MANUAL_TRANSFER';
    case 'CLOSED':
      return !isOpen(s);
  }
}

/** Une case par mensualité : verte payée, rouge en retard, grise à venir. */
function MonthDots({ schedule }: { schedule: AdminPaymentSchedule }) {
  return (
    <div className="cf-schedule-months" aria-hidden="true">
      {schedule.installments.map((i) => (
        <span
          key={i.id}
          title={`${installmentMonthLabel(i.dueOn)} — ${
            i.status === 'PAID' ? 'payée' : i.overdue ? 'en retard' : 'à venir'
          }`}
          className={`cf-schedule-months__dot${
            i.status === 'PAID'
              ? ' cf-schedule-months__dot--paid'
              : i.overdue
                ? ' cf-schedule-months__dot--overdue'
                : ''
          }`}
        />
      ))}
    </div>
  );
}

function nextDueText(s: AdminPaymentSchedule): string {
  if (!s.nextDueOn || s.nextDueCents === null) return '—';
  return `${formatEuros(s.nextDueCents)} le ${installmentDueLabel(s.nextDueOn)}`;
}

/**
 * Onglet « Mensualités » de la facturation : qui paie au mois, comment, et
 * qui est en retard. Un clic ouvre la facture, où l'on encaisse le mois.
 */
export function PaymentSchedulesPanel({
  onOpenInvoice,
}: {
  onOpenInvoice: (invoiceId: string) => void;
}) {
  const isMobile = useIsMobile();
  const { data, loading, error, refetch } =
    useQuery<ClubPaymentSchedulesQueryData>(CLUB_PAYMENT_SCHEDULES, {
      fetchPolicy: 'cache-and-network',
    });
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [search, setSearch] = useState('');

  const schedules = useMemo(() => data?.clubPaymentSchedules ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return schedules.filter((s) => {
      if (!matches(s, filter)) return false;
      if (!q) return true;
      return (
        s.invoiceLabel.toLowerCase().includes(q) ||
        (s.payerLabel ?? '').toLowerCase().includes(q)
      );
    });
  }, [schedules, filter, search]);

  const totals = useMemo(() => {
    let open = 0;
    let overdueFamilies = 0;
    let overdueCents = 0;
    let noCard = 0;
    for (const s of schedules) {
      if (!isOpen(s)) continue;
      open += 1;
      if (s.overdueCount > 0) {
        overdueFamilies += 1;
        overdueCents += s.overdueCents;
      }
      if (s.status === 'PENDING_SETUP') noCard += 1;
    }
    return { open, overdueFamilies, overdueCents, noCard };
  }, [schedules]);

  return (
    <>
      <div className="cf-billing-kpis">
        <div className="cf-billing-kpi">
          <span className="cf-billing-kpi__label">Échéanciers en cours</span>
          <span className="cf-billing-kpi__value">{totals.open}</span>
        </div>
        <div className="cf-billing-kpi">
          <span className="cf-billing-kpi__label">
            En retard ({totals.overdueFamilies} échéancier
            {totals.overdueFamilies > 1 ? 's' : ''})
          </span>
          <span className="cf-billing-kpi__value cf-billing-kpi__value--due">
            {formatEuros(totals.overdueCents)}
          </span>
        </div>
        <div className="cf-billing-kpi">
          <span className="cf-billing-kpi__label">Carte non enregistrée</span>
          <span className="cf-billing-kpi__value">{totals.noCard}</span>
        </div>
      </div>

      <div className="cf-section-toolbar">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Rechercher une famille, une facture…"
        />
        <div
          className="cf-tabs"
          role="tablist"
          aria-label="Filtrer les échéanciers"
        >
          {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              className={`cf-tab${filter === f ? ' cf-tab--active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorState
          title="Impossible de charger les échéanciers"
          message={error.message}
          action={
            <button
              type="button"
              className="btn-primary"
              onClick={() => void refetch()}
            >
              Réessayer
            </button>
          }
        />
      ) : loading && !data ? (
        <LoadingState label="Chargement des échéanciers…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="calendar_month"
          title={
            schedules.length === 0
              ? 'Aucun échéancier pour le moment'
              : 'Aucun échéancier ne correspond à ces filtres'
          }
          message={
            schedules.length === 0
              ? 'Les échéanciers naissent avec les cotisations au mois et les paiements en plusieurs fois.'
              : 'Ajustez la recherche ou changez de filtre.'
          }
        />
      ) : isMobile ? (
        <CardList ariaLabel="Échéanciers">
          {filtered.map((s) => (
            <CardListItem
              key={s.id}
              title={s.payerLabel ?? s.invoiceLabel}
              subtitle={`${SCHEDULE_METHOD_LABELS[s.method]} · ${s.paidCount}/${s.installmentCount} payées · prochaine : ${nextDueText(s)}`}
              meta={
                <span
                  className={
                    s.overdueCount > 0
                      ? 'cf-cardlist__meta--danger'
                      : 'cf-cardlist__meta--ok'
                  }
                >
                  {s.overdueCount > 0
                    ? `${formatEuros(s.overdueCents)} en retard`
                    : formatEuros(s.remainingCents)}
                </span>
              }
              footer={
                <>
                  <ScheduleStatusPill schedule={s} />
                  <MonthDots schedule={s} />
                </>
              }
              onOpen={() => onOpenInvoice(s.invoiceId)}
            />
          ))}
        </CardList>
      ) : (
        <table className="cf-data-table cf-data-table--billing">
          <thead>
            <tr>
              <th>Famille / facture</th>
              <th>Paiement</th>
              <th>Mois</th>
              <th>Prochaine échéance</th>
              <th style={{ textAlign: 'right' }}>En retard</th>
              <th style={{ textAlign: 'right' }}>Reste</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr
                key={s.id}
                className="cf-data-table__row--clickable"
                onClick={() => onOpenInvoice(s.invoiceId)}
              >
                <td>
                  <div className="cf-cell-primary">{s.payerLabel ?? '—'}</div>
                  <div className="cf-cell-muted">{s.invoiceLabel}</div>
                </td>
                <td>
                  <div>{SCHEDULE_METHOD_LABELS[s.method]}</div>
                  <ScheduleStatusPill schedule={s} />
                </td>
                <td>
                  <div>
                    {s.paidCount}/{s.installmentCount} payées
                  </div>
                  <MonthDots schedule={s} />
                </td>
                <td>{nextDueText(s)}</td>
                <td
                  style={{ textAlign: 'right' }}
                  className={s.overdueCount > 0 ? 'cf-cell-danger' : ''}
                >
                  {s.overdueCount > 0
                    ? `${formatEuros(s.overdueCents)} (${s.overdueCount})`
                    : '—'}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>
                  {formatEuros(s.remainingCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
