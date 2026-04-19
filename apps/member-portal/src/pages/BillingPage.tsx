import { useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { VIEWER_FAMILY_BILLING } from '../lib/viewer-documents';
import type { ViewerBillingData } from '../lib/viewer-types';
import { formatEuroCents } from '../lib/format';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';

type StatusFilter = 'ALL' | 'OPEN' | 'PAID' | 'DRAFT';

function statusLabel(status: string): string {
  switch (status) {
    case 'OPEN':
      return 'À payer';
    case 'PAID':
      return 'Payée';
    case 'DRAFT':
      return 'Brouillon';
    case 'VOID':
      return 'Annulée';
    default:
      return status;
  }
}

function methodLabel(method: string): string {
  switch (method) {
    case 'STRIPE_CARD':
      return 'Carte bancaire';
    case 'MANUAL_CASH':
      return 'Espèces';
    case 'MANUAL_CHECK':
      return 'Chèque';
    case 'MANUAL_TRANSFER':
      return 'Virement';
    default:
      return method;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function BillingPage() {
  const { data, loading, error, refetch } = useQuery<ViewerBillingData>(
    VIEWER_FAMILY_BILLING,
    { errorPolicy: 'all', fetchPolicy: 'cache-and-network' },
  );

  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const summary = data?.viewerFamilyBillingSummary;
  const invoices = summary?.invoices ?? [];

  const totals = useMemo(() => {
    let open = 0;
    let paid = 0;
    for (const inv of invoices) {
      if (inv.status === 'OPEN') open += inv.balanceCents;
      if (inv.status === 'PAID') paid += inv.totalPaidCents;
    }
    return { open, paid };
  }, [invoices]);

  const filtered = useMemo(() => {
    if (filter === 'ALL') return invoices;
    return invoices.filter((inv) => inv.status === filter);
  }, [invoices, filter]);

  if (error && !data) {
    return (
      <div className="mp-page">
        <h1 className="mp-page-title">Mes factures</h1>
        <ErrorState
          title="Facturation indisponible"
          message={error.message}
          action={
            <button
              type="button"
              className="mp-btn"
              onClick={() => void refetch()}
            >
              Réessayer
            </button>
          }
        />
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="mp-page">
        <h1 className="mp-page-title">Mes factures</h1>
        <LoadingState label="Chargement…" />
      </div>
    );
  }

  if (!summary || !summary.isPayerView) {
    return (
      <div className="mp-page">
        <h1 className="mp-page-title">Mes factures</h1>
        <EmptyState
          icon="receipt_long"
          title="Accès réservé aux adultes responsables"
          message="La facturation du foyer n'est visible que pour les comptes adultes payeurs. Les mineurs n'ont pas accès à cet espace."
        />
      </div>
    );
  }

  return (
    <div className="mp-page">
      <h1 className="mp-page-title">Mes factures</h1>
      <p className="mp-lead mp-lead--tight">
        Suivi des factures d'adhésion et paiements de votre foyer
        {summary.familyLabel ? ` (${summary.familyLabel})` : ''}.
      </p>

      <section className="mp-billing-kpis">
        <article
          className={`mp-billing-kpi ${totals.open > 0 ? 'mp-billing-kpi--due' : ''}`}
        >
          <span className="mp-billing-kpi__label">Reste à payer</span>
          <span className="mp-billing-kpi__value">
            {formatEuroCents(totals.open)}
          </span>
        </article>
        <article className="mp-billing-kpi mp-billing-kpi--ok">
          <span className="mp-billing-kpi__label">Déjà réglé</span>
          <span className="mp-billing-kpi__value">
            {formatEuroCents(totals.paid)}
          </span>
        </article>
        <article className="mp-billing-kpi">
          <span className="mp-billing-kpi__label">Factures</span>
          <span className="mp-billing-kpi__value">{invoices.length}</span>
        </article>
      </section>

      <div className="mp-tabs" role="tablist" aria-label="Filtrer les factures">
        {(
          [
            { key: 'ALL', label: 'Toutes' },
            { key: 'OPEN', label: 'À payer' },
            { key: 'PAID', label: 'Payées' },
            { key: 'DRAFT', label: 'Brouillons' },
          ] as { key: StatusFilter; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={filter === t.key}
            className={`mp-tab${filter === t.key ? ' mp-tab--active' : ''}`}
            onClick={() => setFilter(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="receipt_long"
          title={
            invoices.length === 0
              ? 'Aucune facture pour le moment'
              : 'Aucune facture pour ce filtre'
          }
          message={
            invoices.length === 0
              ? 'Les factures du club apparaissent ici dès qu’une cotisation est générée.'
              : 'Essayez un autre onglet pour voir d’autres factures.'
          }
        />
      ) : (
        <ul className="mp-invoice-list">
          {filtered.map((inv) => {
            const expanded = expandedId === inv.id;
            const overdue =
              inv.status === 'OPEN' &&
              inv.dueAt &&
              new Date(inv.dueAt).getTime() < Date.now();
            return (
              <li key={inv.id} className="mp-invoice-item">
                <button
                  type="button"
                  className="mp-invoice-item__toggle"
                  aria-expanded={expanded}
                  onClick={() =>
                    setExpandedId((prev) => (prev === inv.id ? null : inv.id))
                  }
                >
                  <div className="mp-invoice-item__main">
                    <span
                      className={`mp-invoice-status-badge mp-invoice-status-badge--${inv.status.toLowerCase()}`}
                    >
                      {statusLabel(inv.status)}
                    </span>
                    <span className="mp-invoice-item__label">{inv.label}</span>
                    {inv.dueAt ? (
                      <span
                        className={`mp-invoice-item__due${overdue ? ' mp-invoice-item__due--overdue' : ''}`}
                      >
                        Échéance {formatDate(inv.dueAt)}
                        {overdue ? ' · en retard' : ''}
                      </span>
                    ) : null}
                  </div>
                  <div className="mp-invoice-item__totals">
                    <span className="mp-invoice-item__amount">
                      {formatEuroCents(inv.amountCents)}
                    </span>
                    {inv.balanceCents > 0 ? (
                      <span className="mp-invoice-item__balance">
                        Reste {formatEuroCents(inv.balanceCents)}
                      </span>
                    ) : null}
                  </div>
                  <span
                    className="material-symbols-outlined mp-invoice-item__chev"
                    aria-hidden
                  >
                    {expanded ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
                {expanded ? (
                  <div className="mp-invoice-item__body">
                    <dl className="mp-invoice-detail-list">
                      <div>
                        <dt>Montant total</dt>
                        <dd>{formatEuroCents(inv.amountCents)}</dd>
                      </div>
                      <div>
                        <dt>Déjà payé</dt>
                        <dd>{formatEuroCents(inv.totalPaidCents)}</dd>
                      </div>
                      <div>
                        <dt>Reste à payer</dt>
                        <dd
                          className={
                            inv.balanceCents > 0
                              ? 'mp-invoice-detail-list__due'
                              : 'mp-invoice-detail-list__ok'
                          }
                        >
                          {formatEuroCents(inv.balanceCents)}
                        </dd>
                      </div>
                    </dl>
                    {inv.payments.length > 0 ? (
                      <>
                        <h3 className="mp-invoice-subtitle">Historique</h3>
                        <ul className="mp-invoice-payments-list">
                          {inv.payments.map((p) => {
                            const payer =
                              p.paidByFirstName || p.paidByLastName
                                ? `${p.paidByFirstName ?? ''} ${p.paidByLastName ?? ''}`.trim()
                                : 'Club';
                            return (
                              <li
                                key={p.id}
                                className="mp-invoice-payments-list__row"
                              >
                                <div>
                                  <div className="mp-invoice-payments-list__method">
                                    {methodLabel(p.method)}
                                  </div>
                                  <div className="mp-invoice-payments-list__meta">
                                    {formatDate(p.createdAt)} · {payer}
                                  </div>
                                </div>
                                <div className="mp-invoice-payments-list__amount">
                                  {formatEuroCents(p.amountCents)}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    ) : (
                      <p className="mp-hint">Aucun paiement enregistré.</p>
                    )}
                    {inv.balanceCents > 0 ? (
                      <p className="mp-hint mp-invoice-item__tip">
                        Pour régler cette facture, contactez le club ou
                        utilisez le moyen de paiement indiqué par votre
                        trésorier (paiement en ligne à venir).
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
