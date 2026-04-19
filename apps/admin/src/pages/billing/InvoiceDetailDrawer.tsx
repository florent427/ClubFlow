import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import {
  CLUB_INVOICE_DETAIL,
  ISSUE_CLUB_INVOICE,
  RECORD_CLUB_MANUAL_PAYMENT,
  VOID_CLUB_INVOICE,
} from '../../lib/documents';
import type {
  ClubInvoiceDetailQueryData,
  ClubPaymentMethodStr,
  InvoiceLineAdjustmentStr,
  InvoiceStatusStr,
  IssueClubInvoiceMutationData,
  RecordClubManualPaymentMutationData,
  VoidClubInvoiceMutationData,
} from '../../lib/types';
import { Drawer } from '../../components/ui/Drawer';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';

function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

const ADJ_LABELS: Record<InvoiceLineAdjustmentStr, string> = {
  DISCOUNT_FAMILY_FLAT: 'Remise famille (forfait)',
  DISCOUNT_FAMILY_PERCENT: 'Remise famille (%)',
  DISCOUNT_PUBLIC_AID: 'Aide publique',
  DISCOUNT_EXCEPTIONAL: 'Remise exceptionnelle',
};

const METHOD_LABELS: Record<ClubPaymentMethodStr, string> = {
  STRIPE_CARD: 'Carte bancaire',
  MANUAL_CASH: 'Espèces',
  MANUAL_CHECK: 'Chèque',
  MANUAL_TRANSFER: 'Virement',
};

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

type ConfirmKind = 'issue' | 'void' | null;

export function InvoiceDetailDrawer({
  invoiceId,
  onClose,
  onChanged,
}: {
  invoiceId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data, loading, error, refetch } =
    useQuery<ClubInvoiceDetailQueryData>(CLUB_INVOICE_DETAIL, {
      variables: { id: invoiceId ?? '' },
      skip: !invoiceId,
      fetchPolicy: 'cache-and-network',
    });

  const [issueInvoice, issueState] = useMutation<IssueClubInvoiceMutationData>(
    ISSUE_CLUB_INVOICE,
  );
  const [voidInvoice, voidState] = useMutation<VoidClubInvoiceMutationData>(
    VOID_CLUB_INVOICE,
  );
  const [recordPayment, payState] =
    useMutation<RecordClubManualPaymentMutationData>(RECORD_CLUB_MANUAL_PAYMENT);

  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const [voidReason, setVoidReason] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<ClubPaymentMethodStr>('MANUAL_CASH');
  const [payRef, setPayRef] = useState('');
  const [payError, setPayError] = useState<string | null>(null);

  const inv = data?.clubInvoice ?? null;
  const isDraft = inv?.status === 'DRAFT';
  const isOpen = inv?.status === 'OPEN';
  const canVoid = inv?.status === 'DRAFT' || inv?.status === 'OPEN';
  const balance = inv?.balanceCents ?? 0;

  const totalAdjustments = useMemo(() => {
    if (!inv) return 0;
    return inv.lines.reduce(
      (s, l) => s + l.adjustments.reduce((a, adj) => a + adj.amountCents, 0),
      0,
    );
  }, [inv]);

  function handleOpenPayForm() {
    if (!inv) return;
    setPayAmount((inv.balanceCents / 100).toFixed(2));
    setPayMethod(inv.lockedPaymentMethod ?? 'MANUAL_CASH');
    setPayRef('');
    setPayError(null);
    setPayOpen(true);
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!inv) return;
    const normalized = payAmount.replace(',', '.').trim();
    const cents = Math.round(Number(normalized) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setPayError('Montant invalide');
      return;
    }
    if (cents > inv.balanceCents) {
      setPayError(
        `Le montant dépasse le reste dû (${formatEuros(inv.balanceCents)}).`,
      );
      return;
    }
    setPayError(null);
    try {
      await recordPayment({
        variables: {
          input: {
            invoiceId: inv.id,
            amountCents: cents,
            method: payMethod,
            externalRef: payRef.trim() || null,
          },
        },
      });
      setPayOpen(false);
      await refetch();
      onChanged();
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleIssue() {
    if (!inv) return;
    try {
      await issueInvoice({ variables: { id: inv.id } });
      setConfirmKind(null);
      await refetch();
      onChanged();
    } catch {
      setConfirmKind(null);
    }
  }

  async function handleVoid() {
    if (!inv) return;
    try {
      await voidInvoice({
        variables: { id: inv.id, reason: voidReason.trim() || null },
      });
      setConfirmKind(null);
      setVoidReason('');
      await refetch();
      onChanged();
    } catch {
      setConfirmKind(null);
    }
  }

  const footer = inv ? (
    <div className="cf-drawer__footer-actions">
      {isDraft ? (
        <button
          type="button"
          className="btn-primary"
          onClick={() => setConfirmKind('issue')}
          disabled={issueState.loading}
        >
          Émettre la facture
        </button>
      ) : null}
      {isOpen && balance > 0 ? (
        <button
          type="button"
          className="btn-primary"
          onClick={handleOpenPayForm}
        >
          Enregistrer un paiement
        </button>
      ) : null}
      {canVoid ? (
        <button
          type="button"
          className="btn-danger"
          onClick={() => setConfirmKind('void')}
          disabled={voidState.loading}
        >
          Annuler la facture
        </button>
      ) : null}
    </div>
  ) : null;

  return (
    <>
      <Drawer
        open={invoiceId !== null}
        onClose={onClose}
        title={
          inv ? (
            <span className="cf-drawer__title-row">
              <span>{inv.label}</span>
              <StatusPill status={inv.status} />
            </span>
          ) : (
            'Facture'
          )
        }
        footer={footer}
        width={640}
      >
        {error ? (
          <ErrorState
            title="Impossible de charger la facture"
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
        ) : loading && !inv ? (
          <LoadingState label="Chargement…" />
        ) : inv ? (
          <div className="cf-invoice-detail">
            <section className="cf-invoice-detail__meta">
              <div className="cf-invoice-detail__meta-row">
                <span className="cf-invoice-detail__meta-label">Foyer</span>
                <span className="cf-invoice-detail__meta-value">
                  {inv.familyLabel ?? '—'}
                </span>
              </div>
              <div className="cf-invoice-detail__meta-row">
                <span className="cf-invoice-detail__meta-label">Saison</span>
                <span className="cf-invoice-detail__meta-value">
                  {inv.clubSeasonLabel ?? '—'}
                </span>
              </div>
              <div className="cf-invoice-detail__meta-row">
                <span className="cf-invoice-detail__meta-label">Créée le</span>
                <span className="cf-invoice-detail__meta-value">
                  {formatDateTime(inv.createdAt)}
                </span>
              </div>
              <div className="cf-invoice-detail__meta-row">
                <span className="cf-invoice-detail__meta-label">Échéance</span>
                <span className="cf-invoice-detail__meta-value">
                  {formatDate(inv.dueAt)}
                </span>
              </div>
              {inv.lockedPaymentMethod ? (
                <div className="cf-invoice-detail__meta-row">
                  <span className="cf-invoice-detail__meta-label">
                    Moyen verrouillé
                  </span>
                  <span className="cf-invoice-detail__meta-value">
                    {METHOD_LABELS[inv.lockedPaymentMethod]}
                  </span>
                </div>
              ) : null}
            </section>

            <section className="cf-invoice-detail__section">
              <h3 className="cf-invoice-detail__section-title">Lignes</h3>
              {inv.lines.length === 0 ? (
                <p className="cf-invoice-detail__empty">Aucune ligne.</p>
              ) : (
                <ul className="cf-invoice-lines">
                  {inv.lines.map((l) => {
                    const lineTotal =
                      l.baseAmountCents +
                      l.adjustments.reduce((s, a) => s + a.amountCents, 0);
                    const productLabel =
                      l.kind === 'MEMBERSHIP_SUBSCRIPTION'
                        ? l.membershipProductLabel ?? 'Adhésion'
                        : l.membershipOneTimeFeeLabel ?? 'Frais';
                    const rhythm =
                      l.subscriptionBillingRhythm === 'MONTHLY'
                        ? ' · Mensuel'
                        : l.subscriptionBillingRhythm === 'ANNUAL'
                          ? ' · Annuel'
                          : '';
                    return (
                      <li key={l.id} className="cf-invoice-line">
                        <div className="cf-invoice-line__head">
                          <div>
                            <div className="cf-invoice-line__member">
                              {l.memberFirstName} {l.memberLastName}
                            </div>
                            <div className="cf-invoice-line__product">
                              {productLabel}
                              {rhythm}
                            </div>
                          </div>
                          <div className="cf-invoice-line__amount">
                            {formatEuros(lineTotal)}
                          </div>
                        </div>
                        {l.adjustments.length > 0 ? (
                          <ul className="cf-invoice-adjustments">
                            <li className="cf-invoice-adjustment cf-invoice-adjustment--base">
                              <span>Montant de base</span>
                              <span>{formatEuros(l.baseAmountCents)}</span>
                            </li>
                            {l.adjustments.map((a) => (
                              <li key={a.id} className="cf-invoice-adjustment">
                                <span>
                                  {ADJ_LABELS[a.type]}
                                  {a.reason ? ` · ${a.reason}` : ''}
                                  {a.percentAppliedBp != null
                                    ? ` (${(a.percentAppliedBp / 100).toFixed(1)} %)`
                                    : ''}
                                </span>
                                <span className="cf-invoice-adjustment__amount">
                                  {formatEuros(a.amountCents)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="cf-invoice-detail__totals">
              <div className="cf-invoice-detail__total-row">
                <span>Sous-total</span>
                <span>{formatEuros(inv.baseAmountCents)}</span>
              </div>
              {totalAdjustments !== 0 ? (
                <div className="cf-invoice-detail__total-row">
                  <span>Remises / ajustements</span>
                  <span>{formatEuros(totalAdjustments)}</span>
                </div>
              ) : null}
              <div className="cf-invoice-detail__total-row cf-invoice-detail__total-row--strong">
                <span>Total</span>
                <span>{formatEuros(inv.amountCents)}</span>
              </div>
              <div className="cf-invoice-detail__total-row">
                <span>Encaissé</span>
                <span className="cf-cell-ok">
                  {formatEuros(inv.totalPaidCents)}
                </span>
              </div>
              <div className="cf-invoice-detail__total-row cf-invoice-detail__total-row--strong">
                <span>Reste dû</span>
                <span
                  className={
                    inv.balanceCents > 0 ? 'cf-cell-danger' : 'cf-cell-ok'
                  }
                >
                  {formatEuros(inv.balanceCents)}
                </span>
              </div>
            </section>

            <section className="cf-invoice-detail__section">
              <h3 className="cf-invoice-detail__section-title">Paiements</h3>
              {inv.payments.length === 0 ? (
                <p className="cf-invoice-detail__empty">
                  Aucun paiement enregistré.
                </p>
              ) : (
                <ul className="cf-invoice-payments">
                  {inv.payments.map((p) => {
                    const payer =
                      p.paidByFirstName || p.paidByLastName
                        ? `${p.paidByFirstName ?? ''} ${p.paidByLastName ?? ''}`.trim()
                        : null;
                    return (
                      <li key={p.id} className="cf-invoice-payment">
                        <div>
                          <div className="cf-invoice-payment__method">
                            {METHOD_LABELS[p.method]}
                            {p.externalRef ? ` · ${p.externalRef}` : ''}
                          </div>
                          <div className="cf-invoice-payment__meta">
                            {formatDateTime(p.createdAt)}
                            {payer ? ` · ${payer}` : ''}
                          </div>
                        </div>
                        <div className="cf-invoice-payment__amount">
                          {formatEuros(p.amountCents)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {payOpen ? (
              <form
                className="cf-invoice-pay-form"
                onSubmit={handleRecordPayment}
              >
                <h3 className="cf-invoice-detail__section-title">
                  Nouveau paiement
                </h3>
                <div className="cf-form-row">
                  <label className="cf-field">
                    <span className="cf-field__label">Montant (€)</span>
                    <input
                      className="cf-field__input"
                      type="text"
                      inputMode="decimal"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      required
                    />
                  </label>
                  <label className="cf-field">
                    <span className="cf-field__label">Méthode</span>
                    <select
                      className="cf-field__input"
                      value={payMethod}
                      onChange={(e) =>
                        setPayMethod(e.target.value as ClubPaymentMethodStr)
                      }
                      disabled={inv.lockedPaymentMethod != null}
                    >
                      <option value="MANUAL_CASH">Espèces</option>
                      <option value="MANUAL_CHECK">Chèque</option>
                      <option value="MANUAL_TRANSFER">Virement</option>
                      <option value="STRIPE_CARD">Carte bancaire</option>
                    </select>
                  </label>
                </div>
                <label className="cf-field">
                  <span className="cf-field__label">
                    Référence (n° chèque, virement…)
                  </span>
                  <input
                    className="cf-field__input"
                    type="text"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    maxLength={500}
                  />
                </label>
                {payError ? (
                  <p className="cf-form-error" role="alert">
                    {payError}
                  </p>
                ) : null}
                <div className="cf-form-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setPayOpen(false)}
                    disabled={payState.loading}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={payState.loading}
                  >
                    {payState.loading ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        ) : null}
      </Drawer>

      <ConfirmModal
        open={confirmKind === 'issue'}
        title="Émettre la facture ?"
        message="La facture passera de Brouillon à Ouverte. Les payeurs pourront la régler."
        confirmLabel="Émettre"
        loading={issueState.loading}
        onConfirm={handleIssue}
        onCancel={() => setConfirmKind(null)}
      />

      <ConfirmModal
        open={confirmKind === 'void'}
        title="Annuler la facture ?"
        message={
          <>
            <p>Cette action est irréversible.</p>
            <label className="cf-field" style={{ marginTop: 12 }}>
              <span className="cf-field__label">Motif (optionnel)</span>
              <input
                className="cf-field__input"
                type="text"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                maxLength={200}
                placeholder="Erreur de saisie, double facture…"
              />
            </label>
          </>
        }
        confirmLabel="Annuler la facture"
        danger
        loading={voidState.loading}
        onConfirm={handleVoid}
        onCancel={() => {
          setConfirmKind(null);
          setVoidReason('');
        }}
      />
    </>
  );
}
