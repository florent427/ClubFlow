import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  VIEWER_APPLY_PAYER_CREDIT,
  VIEWER_CREATE_INVOICE_CHECKOUT_SESSION,
  VIEWER_FAMILY_BILLING,
  VIEWER_PAYER_CREDIT,
} from '../lib/viewer-documents';
import type {
  ViewerApplyPayerCreditData,
  ViewerBillingData,
  ViewerCreateInvoiceCheckoutSessionData,
  ViewerPayerCreditData,
} from '../lib/viewer-types';
import { formatEuroCents, formatShortDate } from '../lib/format';
import {
  payerCreditApplyCents,
  payerCreditApplyConfirmation,
  paymentMethodLabel,
  shouldShowPayerCredit,
} from '../lib/payer-credit';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useToast } from '../components/ToastProvider';
import { DocumentsToSignBanner } from '../components/DocumentsToSignBanner';
import { InvoicePaymentSchedule } from '../components/billing/InvoicePaymentSchedule';
import { InvoiceManualPaymentChoice } from '../components/billing/InvoiceManualPaymentChoice';
import {
  PayerCreditHistory,
  PayerCreditKpi,
} from '../components/billing/PayerCredit';

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

export function BillingPage() {
  const { data, loading, error, refetch } = useQuery<ViewerBillingData>(
    VIEWER_FAMILY_BILLING,
    { errorPolicy: 'all', fetchPolicy: 'cache-and-network' },
  );

  const [filter, setFilter] = useState<StatusFilter>('ALL');
  // `?facture=<id>` : la page Famille et le tableau de bord envoient ici
  // avec la facture déjà dépliée, pour que le bouton « Payer en ligne »
  // soit visible d'emblée. Sans ça on atterrissait sur une liste repliée,
  // et il fallait deviner qu'il faut cliquer la ligne.
  const [expandedId, setExpandedId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('facture'),
  );
  const [payingId, setPayingId] = useState<string | null>(null);
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [createCheckoutSession] =
    useMutation<ViewerCreateInvoiceCheckoutSessionData>(
      VIEWER_CREATE_INVOICE_CHECKOUT_SESSION,
    );

  // Crédit du compte (ADR-0022). Une erreur, module Paiement coupé compris,
  // ne donne rien à afficher : ni solde, ni bouton.
  const { data: creditData, refetch: refetchCredit } =
    useQuery<ViewerPayerCreditData>(VIEWER_PAYER_CREDIT, {
      errorPolicy: 'all',
      fetchPolicy: 'cache-and-network',
    });
  const credit = creditData?.viewerPayerCredit ?? null;
  const [applyPayerCredit] = useMutation<ViewerApplyPayerCreditData>(
    VIEWER_APPLY_PAYER_CREDIT,
  );
  const [creditInvoiceId, setCreditInvoiceId] = useState<string | null>(null);
  const [applyingCredit, setApplyingCredit] = useState(false);

  useEffect(() => {
    const paid = searchParams.get('paid');
    const canceled = searchParams.get('canceled');
    if (paid === '1') {
      showToast('Paiement enregistré. Merci !', 'success');
      void refetch();
    } else if (canceled === '1') {
      showToast('Paiement annulé.', 'info');
    }
    if (paid || canceled) {
      const next = new URLSearchParams(searchParams);
      next.delete('paid');
      next.delete('canceled');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, showToast, refetch]);

  async function handlePay(invoiceId: string): Promise<void> {
    if (payingId) return;
    setPayingId(invoiceId);
    try {
      const res = await createCheckoutSession({ variables: { invoiceId } });
      const url = res.data?.viewerCreateInvoiceCheckoutSession.url;
      if (!url) {
        throw new Error('URL de paiement manquante.');
      }
      window.location.assign(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Paiement indisponible.';
      showToast(msg, 'error');
      setPayingId(null);
    }
  }

  const summary = data?.viewerFamilyBillingSummary;
  const invoices = summary?.invoices ?? [];
  const creditInvoice = invoices.find((inv) => inv.id === creditInvoiceId);
  const creditApplyCents = creditInvoice
    ? payerCreditApplyCents(creditInvoice, credit?.balanceCents)
    : 0;

  // Le montant envoyé est celui que l'adhérent vient de confirmer : l'API le
  // refuse s'il dépasse le crédit ou le reste dû relus sous verrou.
  async function handleApplyCredit(): Promise<void> {
    if (!creditInvoice || creditApplyCents <= 0 || applyingCredit) return;
    setApplyingCredit(true);
    try {
      const res = await applyPayerCredit({
        variables: {
          invoiceId: creditInvoice.id,
          amountCents: creditApplyCents,
        },
      });
      const applied =
        res.data?.viewerApplyPayerCredit.amountCents ?? creditApplyCents;
      showToast(`${formatEuroCents(applied)} réglés avec votre crédit.`, 'success');
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'Règlement par crédit impossible.';
      showToast(msg, 'error');
    } finally {
      setApplyingCredit(false);
      setCreditInvoiceId(null);
      void refetch();
      void refetchCredit();
    }
  }

  const totals = useMemo(() => {
    let open = 0;
    let paid = 0;
    for (const inv of invoices) {
      if (inv.status === 'OPEN') open += inv.balanceCents;
      paid += inv.totalPaidCents;
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
      <DocumentsToSignBanner />
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
        {shouldShowPayerCredit(credit) ? (
          <PayerCreditKpi credit={credit} />
        ) : null}
      </section>
      {shouldShowPayerCredit(credit) ? (
        <PayerCreditHistory movements={credit.movements} />
      ) : null}

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
            invoices.length > 0
              ? 'Essayez un autre onglet pour voir d’autres factures.'
              : // Un adhérent qui n'est pas le payeur de son foyer ne voit
                // aucune facture : le périmètre est calculé côté serveur sur
                // le rôle PAYER. Lui afficher « aucune facture » sans autre
                // explication laisse croire à un bug — c'est justement ce qui
                // a été remonté.
                'Les factures de votre foyer sont adressées à son payeur ' +
                'désigné, qui seul peut les régler en ligne. Si vous devez ' +
                'les payer vous-même, demandez au club de vous désigner ' +
                'payeur de votre foyer.'
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
                        Échéance {formatShortDate(inv.dueAt)}
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
                                    {paymentMethodLabel(p.method)}
                                  </div>
                                  <div className="mp-invoice-payments-list__meta">
                                    {formatShortDate(p.createdAt)} · {payer}
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
                      <div className="mp-invoice-item__pay">
                        <button
                          type="button"
                          className="mp-btn mp-btn-primary"
                          onClick={() => void handlePay(inv.id)}
                          disabled={payingId !== null}
                        >
                          <span
                            className="material-symbols-outlined"
                            aria-hidden
                          >
                            credit_card
                          </span>
                          {payingId === inv.id
                            ? 'Redirection…'
                            : `Payer en ligne ${formatEuroCents(inv.balanceCents)}`}
                        </button>
                        {payerCreditApplyCents(inv, credit?.balanceCents) > 0 ? (
                          <button
                            type="button"
                            className="mp-btn mp-btn-outline"
                            onClick={() => setCreditInvoiceId(inv.id)}
                            disabled={payingId !== null || applyingCredit}
                          >
                            <span
                              className="material-symbols-outlined"
                              aria-hidden
                            >
                              account_balance_wallet
                            </span>
                            {`Utiliser mon crédit ${formatEuroCents(payerCreditApplyCents(inv, credit?.balanceCents))}`}
                          </button>
                        ) : null}
                        <p className="mp-hint mp-invoice-item__tip">
                          Paiement sécurisé Stripe. Vous pouvez également régler
                          directement auprès du club.
                        </p>
                      </div>
                    ) : null}
                    {/* Repli hors ligne : virement / chèque / espèces. */}
                    <InvoiceManualPaymentChoice
                      invoiceId={inv.id}
                      balanceCents={inv.balanceCents}
                      invoiceStatus={inv.status}
                    />
                    {/* Échéancier : proposé à côté du paiement comptant. */}
                    <InvoicePaymentSchedule
                      invoiceId={inv.id}
                      balanceCents={inv.balanceCents}
                      invoiceStatus={inv.status}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmModal
        open={creditInvoice != null && creditApplyCents > 0}
        title="Utiliser mon crédit"
        message={
          creditInvoice && credit
            ? payerCreditApplyConfirmation({
                invoiceLabel: creditInvoice.label,
                applyCents: creditApplyCents,
                invoiceBalanceCents: creditInvoice.balanceCents,
                creditBalanceCents: credit.balanceCents,
              })
            : undefined
        }
        confirmLabel={`Régler ${formatEuroCents(creditApplyCents)}`}
        loading={applyingCredit}
        onConfirm={() => void handleApplyCredit()}
        onCancel={() => setCreditInvoiceId(null)}
      />
    </div>
  );
}
