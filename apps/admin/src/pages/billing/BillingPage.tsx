import { useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { CLUB_INVOICES } from '../../lib/documents';
import type {
  ClubInvoicesQueryData,
  InvoiceStatusStr,
} from '../../lib/types';
import { useClubModules } from '../../lib/club-modules-context';
import { downloadCsv, toCsv } from '../../lib/csv-export';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingState, Skeleton } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { SearchBox } from '../../components/ui/SearchBox';
import { InvoiceDetailDrawer } from './InvoiceDetailDrawer';

function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function StatusPill({ status }: { status: InvoiceStatusStr }) {
  const cls: Record<InvoiceStatusStr, string> = {
    DRAFT: 'cf-pill cf-pill--draft',
    OPEN: 'cf-pill cf-pill--warn',
    PAID: 'cf-pill cf-pill--ok',
    VOID: 'cf-pill',
  };
  const label: Record<InvoiceStatusStr, string> = {
    DRAFT: 'Brouillon',
    OPEN: 'À payer',
    PAID: 'Payée',
    VOID: 'Annulée',
  };
  return <span className={cls[status]}>{label[status]}</span>;
}

type StatusFilter = 'ALL' | InvoiceStatusStr;

export function BillingPage() {
  const { isEnabled } = useClubModules();
  const paymentOn = isEnabled('PAYMENT');

  const { data, loading, error, refetch } = useQuery<ClubInvoicesQueryData>(
    CLUB_INVOICES,
    {
      skip: !paymentOn,
      fetchPolicy: 'cache-and-network',
    },
  );

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);

  const invoices = data?.clubInvoices ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (status !== 'ALL' && inv.status !== status) return false;
      if (q && !inv.label.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [invoices, search, status]);

  const totals = useMemo(() => {
    let open = 0;
    let paid = 0;
    let draft = 0;
    for (const inv of invoices) {
      if (inv.status === 'OPEN') open += inv.balanceCents;
      else if (inv.status === 'PAID') paid += inv.totalPaidCents;
      else if (inv.status === 'DRAFT') draft += inv.amountCents;
    }
    return { open, paid, draft };
  }, [invoices]);

  if (!paymentOn) {
    return (
      <div className="cf-page">
        <div className="cf-page__header">
          <div>
            <h1 className="cf-page__title">Facturation</h1>
            <p className="cf-page__subtitle">
              Activez le module Paiement pour gérer les factures du club.
            </p>
          </div>
        </div>
        <EmptyState
          icon="lock"
          title="Module Paiement désactivé"
          message="Rendez-vous dans Modules du club pour l'activer."
        />
      </div>
    );
  }

  return (
    <div className="cf-page">
      <div className="cf-page__header">
        <div>
          <h1 className="cf-page__title">Facturation</h1>
          <p className="cf-page__subtitle">
            Factures du club, encaissements et suivi du reste à payer.
          </p>
        </div>
        <div className="cf-page__actions">
          <button
            type="button"
            className="cf-btn cf-btn--ghost"
            onClick={() => {
              const csv = toCsv(
                [
                  'Libellé',
                  'Foyer',
                  'Échéance',
                  'Montant',
                  'Payé',
                  'Reste dû',
                  'Statut',
                ],
                filtered.map((inv) => [
                  inv.label,
                  inv.householdGroupLabel ?? inv.familyLabel ?? '',
                  inv.dueAt ? inv.dueAt.slice(0, 10) : '',
                  (inv.amountCents / 100).toFixed(2),
                  (inv.totalPaidCents / 100).toFixed(2),
                  (inv.balanceCents / 100).toFixed(2),
                  inv.status,
                ]),
              );
              const ts = new Date().toISOString().slice(0, 10);
              downloadCsv(`factures-${ts}.csv`, csv);
            }}
            disabled={!filtered.length}
          >
            <span className="material-symbols-outlined">download</span>
            Exporter CSV
          </button>
        </div>
      </div>

      <div className="cf-billing-kpis">
        <div className="cf-billing-kpi">
          <span className="cf-billing-kpi__label">Brouillons</span>
          <span className="cf-billing-kpi__value">
            {loading && !data ? <Skeleton width={90} /> : formatEuros(totals.draft)}
          </span>
        </div>
        <div className="cf-billing-kpi">
          <span className="cf-billing-kpi__label">Restant dû (ouvertes)</span>
          <span className="cf-billing-kpi__value cf-billing-kpi__value--due">
            {loading && !data ? <Skeleton width={90} /> : formatEuros(totals.open)}
          </span>
        </div>
        <div className="cf-billing-kpi">
          <span className="cf-billing-kpi__label">Encaissé (factures payées)</span>
          <span className="cf-billing-kpi__value cf-billing-kpi__value--ok">
            {loading && !data ? <Skeleton width={90} /> : formatEuros(totals.paid)}
          </span>
        </div>
      </div>

      <div className="cf-section-toolbar">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Rechercher une facture…"
        />
        <div className="cf-tabs" role="tablist">
          {(['ALL', 'DRAFT', 'OPEN', 'PAID', 'VOID'] as StatusFilter[]).map(
            (s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={status === s}
                className={`cf-tab${status === s ? ' cf-tab--active' : ''}`}
                onClick={() => setStatus(s)}
              >
                {s === 'ALL'
                  ? 'Toutes'
                  : s === 'DRAFT'
                    ? 'Brouillons'
                    : s === 'OPEN'
                      ? 'Ouvertes'
                      : s === 'PAID'
                        ? 'Payées'
                        : 'Annulées'}
              </button>
            ),
          )}
        </div>
      </div>

      {error ? (
        <ErrorState
          title="Impossible de charger les factures"
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
        <LoadingState label="Chargement des factures…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="receipt_long"
          title={
            invoices.length === 0
              ? 'Aucune facture pour le moment'
              : 'Aucune facture ne correspond à ces filtres'
          }
          message={
            invoices.length === 0
              ? "Les factures d'adhésion apparaissent ici dès que vous en générez depuis les fiches membres, ou dès qu'un payeur choisit une formule via le portail."
              : 'Ajustez la recherche ou changez d\u2019onglet.'
          }
        />
      ) : (
        <table className="cf-data-table cf-data-table--billing">
          <thead>
            <tr>
              <th>Facture</th>
              <th>Foyer</th>
              <th>Échéance</th>
              <th style={{ textAlign: 'right' }}>Montant</th>
              <th style={{ textAlign: 'right' }}>Reste dû</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inv) => {
              const overdue =
                inv.status === 'OPEN' &&
                inv.dueAt &&
                new Date(inv.dueAt).getTime() < Date.now();
              return (
                <tr
                  key={inv.id}
                  className="cf-data-table__row--clickable"
                  onClick={() => setOpenId(inv.id)}
                >
                  <td>
                    <div className="cf-cell-primary">{inv.label}</div>
                    <div className="cf-cell-muted">
                      {inv.id.slice(0, 8)}
                    </div>
                  </td>
                  <td>
                    {inv.householdGroupLabel ??
                      inv.familyLabel ??
                      (inv.familyId ? inv.familyId.slice(0, 8) : '—')}
                  </td>
                  <td className={overdue ? 'cf-cell-danger' : ''}>
                    {formatDate(inv.dueAt)}
                    {overdue ? ' · en retard' : ''}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {formatEuros(inv.amountCents)}
                  </td>
                  <td
                    style={{ textAlign: 'right' }}
                    className={
                      inv.balanceCents > 0 ? 'cf-cell-danger' : 'cf-cell-ok'
                    }
                  >
                    {formatEuros(inv.balanceCents)}
                  </td>
                  <td>
                    <StatusPill status={inv.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <InvoiceDetailDrawer
        invoiceId={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => void refetch()}
      />
    </div>
  );
}
