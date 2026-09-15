import { useMutation, useQuery } from '@apollo/client/react';
import { useState, type CSSProperties } from 'react';
import { useClubModules } from '../lib/club-modules-context';
import { CLUB_PAYER_CREDIT, RECORD_PAYER_CREDIT_DEPOSIT } from '../lib/documents';
import { downloadInvoicePdf, invoicePdfFilename } from '../lib/invoice-pdf-download';
import {
  PAYER_CREDIT_DEPOSIT_METHODS,
  buildPayerCreditDepositInput,
  creditUseAmountLabel,
  describeCreditUse,
  describeDepositPayments,
  emptyPayerCreditDepositForm,
  type PayerCreditDepositForm,
  type PayerCreditDepositMethod,
} from '../lib/payer-credit';
import { clubPaymentMethodLabel } from '../lib/payment-labels';
import type {
  ClubPayerCreditQueryData,
  RecordPayerCreditDepositMutationData,
} from '../lib/types';

function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Crédit d'une personne (ADR-0022) : solde, avances versées, et encaissement
 * d'une avance au guichet. Le membre et le contact d'un même compte partagent
 * un seul crédit : les deux fiches montrent le même bloc.
 */
export function PayerCreditPanel({
  memberId,
  contactId,
  style,
}: {
  memberId?: string;
  contactId?: string;
  style?: CSSProperties;
}) {
  const { isEnabled } = useClubModules();
  const paymentOn = isEnabled('PAYMENT');
  const { data, loading, error, refetch } = useQuery<ClubPayerCreditQueryData>(
    CLUB_PAYER_CREDIT,
    {
      variables: { memberId: memberId ?? null, contactId: contactId ?? null },
      skip: !paymentOn,
      fetchPolicy: 'cache-and-network',
    },
  );
  const [recordDeposit, recordState] =
    useMutation<RecordPayerCreditDepositMutationData>(RECORD_PAYER_CREDIT_DEPOSIT);

  const [form, setForm] = useState<PayerCreditDepositForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);

  if (!paymentOn) return null;

  const credit = data?.clubPayerCredit ?? null;

  function update(patch: Partial<PayerCreditDepositForm>) {
    setForm((f) => (f ? { ...f, ...patch } : f));
  }

  function openForm() {
    setNotice(null);
    setFormError(null);
    setForm(
      emptyPayerCreditDepositForm(
        credit?.displayName ?? '',
        new Date().toISOString().slice(0, 10),
      ),
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const built = buildPayerCreditDepositInput({ memberId, contactId }, form);
    if ('error' in built) {
      setFormError(built.error);
      return;
    }
    setFormError(null);
    try {
      const res = await recordDeposit({ variables: { input: built.input } });
      const balance = res.data?.recordPayerCreditDeposit.balanceCents;
      setForm(null);
      setNotice(
        `Avance de ${formatEuros(built.input.amountCents)} encaissée.` +
          (balance != null ? ` Crédit disponible : ${formatEuros(balance)}.` : ''),
      );
      await refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Encaissement impossible.');
    }
  }

  async function onDownload(invoiceId: string) {
    setPdfError(null);
    setPdfLoadingId(invoiceId);
    try {
      await downloadInvoicePdf(
        invoiceId,
        invoicePdfFilename({
          id: invoiceId,
          isCreditNote: false,
          purpose: 'PAYER_CREDIT_DEPOSIT',
        }),
      );
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Téléchargement impossible.');
    } finally {
      setPdfLoadingId(null);
    }
  }

  return (
    <div className="family-drawer__section payer-credit" style={style}>
      <h3 className="family-drawer__h">
        <span className="material-symbols-outlined" aria-hidden>
          savings
        </span>
        Crédit
      </h3>

      {error ? (
        <p className="form-error" role="alert">
          Crédit indisponible : {error.message}
        </p>
      ) : loading && !credit ? (
        <p className="muted">Chargement…</p>
      ) : credit ? (
        <>
          <p className="payer-credit__balance">
            <span className="payer-credit__balance-label">Crédit disponible</span>
            <strong className="payer-credit__balance-value">
              {formatEuros(credit.balanceCents)}
            </strong>
          </p>
          <p className="muted members-form__hint">
            Argent versé d’avance, sans facture : il reste au crédit de la
            personne.
          </p>
          {credit.deposits.length === 0 ? (
            <p className="muted">Aucune avance versée.</p>
          ) : (
            <ul className="payer-credit__deposits">
              {credit.deposits.map((d) => (
                <li key={d.invoiceId} className="payer-credit__deposit">
                  <div>
                    <div>{formatDate(d.createdAt)}</div>
                    <div className="muted">{describeDepositPayments(d.payments)}</div>
                  </div>
                  <div className="payer-credit__deposit-side">
                    <strong>{formatEuros(d.amountCents)}</strong>
                    <button
                      type="button"
                      className="btn btn-ghost btn-tight"
                      disabled={pdfLoadingId === d.invoiceId}
                      onClick={() => void onDownload(d.invoiceId)}
                      title="Télécharger le reçu d’avance en PDF"
                    >
                      {pdfLoadingId === d.invoiceId ? '…' : 'Reçu PDF'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {credit.uses.length > 0 ? (
            <>
              <p className="payer-credit__subtitle">Utilisations</p>
              <ul className="payer-credit__deposits">
                {credit.uses.map((u) => (
                  <li key={u.paymentId} className="payer-credit__deposit">
                    <div>
                      <div>{formatDate(u.createdAt)}</div>
                      <div className="muted">{describeCreditUse(u)}</div>
                    </div>
                    <div className="payer-credit__deposit-side">
                      <strong>{creditUseAmountLabel(u.amountCents)}</strong>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : null}

      {pdfError ? (
        <p className="form-error" role="alert">
          {pdfError}
        </p>
      ) : null}
      {notice ? (
        <p className="muted" role="status">
          {notice}
        </p>
      ) : null}

      {form ? (
        <form className="payer-credit__form" onSubmit={(e) => void onSubmit(e)}>
          <label className="field">
            <span>Montant (€)</span>
            <input
              type="text"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => update({ amount: e.target.value })}
              placeholder="50,00"
              required
            />
          </label>
          <label className="field">
            <span>Moyen</span>
            <select
              value={form.method}
              onChange={(e) =>
                update({ method: e.target.value as PayerCreditDepositMethod })
              }
            >
              {PAYER_CREDIT_DEPOSIT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {clubPaymentMethodLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              {form.method === 'MANUAL_CHECK'
                ? 'N° du chèque'
                : 'Référence (facultative)'}
            </span>
            <input
              type="text"
              value={form.reference}
              onChange={(e) => update({ reference: e.target.value })}
              maxLength={500}
            />
          </label>
          {form.method === 'MANUAL_CHECK' ? (
            <>
              <label className="field">
                <span>Émetteur (nom sur le chèque)</span>
                <input
                  type="text"
                  value={form.chequeDrawer}
                  onChange={(e) => update({ chequeDrawer: e.target.value })}
                  maxLength={120}
                />
              </label>
              <label className="field">
                <span>Banque émettrice</span>
                <input
                  type="text"
                  value={form.chequeBank}
                  onChange={(e) => update({ chequeBank: e.target.value })}
                  maxLength={80}
                  placeholder="Ex : Crédit Agricole"
                />
              </label>
              <label className="field">
                <span>Reçu le</span>
                <input
                  type="date"
                  value={form.chequeReceivedOn}
                  onChange={(e) => update({ chequeReceivedOn: e.target.value })}
                />
              </label>
              <p className="muted members-form__hint">
                Le chèque va en portefeuille (compte 511200) jusqu’à sa remise
                en banque, à faire dans Comptabilité → Chèques & remises.
              </p>
            </>
          ) : null}
          {formError ? (
            <p className="form-error" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="members-form__actions-row">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setForm(null)}
              disabled={recordState.loading}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={recordState.loading}
            >
              {recordState.loading ? 'Encaissement…' : 'Encaisser'}
            </button>
          </div>
        </form>
      ) : credit ? (
        <div className="members-form__actions-row">
          <button type="button" className="btn btn-primary" onClick={openForm}>
            Encaisser une avance
          </button>
        </div>
      ) : null}
    </div>
  );
}
