import { useLazyQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { BANK_LINE_PAYER_CANDIDATES } from '../../../lib/documents';
import type {
  BankLinePayerCandidatesData,
  BankPayerCandidate,
  BankStatementLine,
  BankTransferAllocation,
} from '../../../lib/types';
import { centsToInput, formatEuro, formatFr, inputToCents } from './format';

type Props = {
  line: BankStatementLine;
  busy: boolean;
  onAccept: (allocations: BankTransferAllocation[], payer: BankPayerCandidate) => void;
};

const MATCH_LABELS: Record<string, string> = {
  EXACT: 'le montant solde exactement cette facture',
  SUM: 'le montant solde ces deux factures',
  PARTIAL: 'acompte sur la facture la plus ancienne',
  NONE: 'aucune facture ne correspond à ce montant',
};

function payerName(c: BankPayerCandidate): string {
  return `${c.payer.firstName} ${c.payer.lastName}`.trim();
}

/**
 * Virement d'adhérent (ADR-0014 §7) : plutôt qu'une recette générique, on
 * encaisse LA facture. Un clic quand le nom et le montant sont reconnus ;
 * sinon le trésorier choisit le payeur et la répartition lui-même.
 */
export function PayerCard({ line, busy, onAccept }: Props) {
  const proposal = line.payerProposal;
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<BankPayerCandidate | null>(null);
  const [parts, setParts] = useState<Record<string, string>>({});
  const [load, { data, loading }] = useLazyQuery<BankLinePayerCandidatesData>(
    BANK_LINE_PAYER_CANDIDATES,
    { fetchPolicy: 'network-only' },
  );
  const candidates = data?.bankLinePayerCandidates ?? [];

  const total = useMemo(
    () =>
      Object.values(parts).reduce((s, v) => {
        const c = inputToCents(v);
        return s + (c !== null && !Number.isNaN(c) ? c : 0);
      }, 0),
    [parts],
  );
  const remaining = line.amountCents - total;

  function openSearch() {
    setOpen(true);
    void load({ variables: { lineId: line.id } });
  }

  function choose(c: BankPayerCandidate) {
    setSelected(c);
    const next: Record<string, string> = {};
    for (const a of c.allocations) next[a.invoiceId] = centsToInput(a.amountCents);
    setParts(next);
  }

  function submitSelected() {
    if (!selected) return;
    const allocations = Object.entries(parts)
      .map(([invoiceId, v]) => ({ invoiceId, amountCents: inputToCents(v) ?? 0 }))
      .filter((a) => a.amountCents > 0);
    onAccept(allocations, selected);
  }

  if (proposal && !open) {
    const invoices = proposal.allocations
      .map((a) => ({
        allocation: a,
        invoice: proposal.invoices.find((i) => i.id === a.invoiceId),
      }))
      .filter((x) => x.invoice);
    return (
      <div
        className="members-panel"
        style={{ padding: 10, margin: 0, background: '#eef2ff', borderLeft: '3px solid #4338ca' }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <strong>Virement de {payerName(proposal)}</strong>
          <span className="cf-pill cf-pill--ok">{proposal.confidence} % · {MATCH_LABELS[proposal.amountMatch] ?? ''}</span>
        </div>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {invoices.map(({ allocation, invoice }) => (
            <li key={allocation.invoiceId}>
              {invoice?.label} — {formatEuro(allocation.amountCents)}
              {invoice && allocation.amountCents < invoice.balanceCents ? (
                <span className="cf-muted"> (acompte, reste {formatEuro(invoice.balanceCents - allocation.amountCents)})</span>
              ) : null}
              {invoice?.dueAt ? <small className="cf-muted"> · échéance {formatFr(invoice.dueAt)}</small> : null}
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => onAccept(proposal.allocations, proposal)}
          >
            Encaisser
          </button>
          <button type="button" className="btn-ghost" disabled={busy} onClick={openSearch}>
            Choisir un autre payeur…
          </button>
        </div>
        <div className="cf-muted" style={{ fontSize: '0.8rem', marginTop: 6 }}>
          Encaisser enregistre le paiement au nom de {payerName(proposal)}, solde la facture,
          comptabilise la recette et rapproche la ligne.
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="cf-muted" style={{ padding: '4px 0' }}>
        Virement d’un adhérent ?{' '}
        <button type="button" className="btn-ghost btn-ghost--sm" disabled={busy} onClick={openSearch}>
          Identifier le payeur
        </button>
      </div>
    );
  }

  return (
    <div
      className="members-panel"
      style={{ padding: 10, margin: 0, background: '#eef2ff', borderLeft: '3px solid #4338ca' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong>Qui a envoyé ce virement de {formatEuro(line.amountCents)} ?</strong>
        <button
          type="button"
          className="btn-ghost btn-ghost--sm"
          style={{ marginLeft: 'auto' }}
          onClick={() => {
            setOpen(false);
            setSelected(null);
          }}
        >
          Fermer
        </button>
      </div>
      {loading ? (
        <p className="cf-muted">Recherche…</p>
      ) : candidates.length === 0 ? (
        <p className="cf-muted">
          Aucun adhérent ni contact reconnu dans ce libellé, ou aucune facture ouverte à leur nom.
          Traite cette ligne comme une recette ordinaire, ou rapproche-la d’une écriture existante.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
            {candidates.map((c) => (
              <button
                key={`${c.payer.kind}-${c.payer.id}`}
                type="button"
                className={
                  selected?.payer.id === c.payer.id ? 'btn-primary' : 'btn-ghost'
                }
                onClick={() => choose(c)}
              >
                {payerName(c)}
                <small style={{ marginLeft: 6, opacity: 0.8 }}>
                  {c.invoices.length} facture{c.invoices.length > 1 ? 's' : ''}
                </small>
              </button>
            ))}
          </div>
          {selected ? (
            selected.invoices.length === 0 ? (
              <p className="cf-muted">Aucune facture ouverte pour cette personne.</p>
            ) : (
              <>
                <table className="cf-table">
                  <thead>
                    <tr>
                      <th>Facture</th>
                      <th>Échéance</th>
                      <th style={{ textAlign: 'right' }}>Reste dû</th>
                      <th style={{ width: 140 }}>Part (€)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.invoices.map((i) => (
                      <tr key={i.id}>
                        <td>{i.label}</td>
                        <td>{i.dueAt ? formatFr(i.dueAt) : '—'}</td>
                        <td style={{ textAlign: 'right' }}>{formatEuro(i.balanceCents)}</td>
                        <td>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={parts[i.id] ?? ''}
                            onChange={(e) => setParts((p) => ({ ...p, [i.id]: e.target.value }))}
                            placeholder="0,00"
                            style={{ width: '100%', textAlign: 'right' }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <span className="cf-muted">
                    Affecté {formatEuro(total)} / {formatEuro(line.amountCents)}
                    {remaining !== 0 ? ` (reste ${formatEuro(Math.abs(remaining))})` : ''}
                  </span>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy || remaining !== 0 || total === 0}
                    onClick={submitSelected}
                  >
                    Encaisser
                  </button>
                </div>
              </>
            )
          ) : (
            <p className="cf-muted">Choisis un payeur pour voir ses factures ouvertes.</p>
          )}
        </>
      )}
    </div>
  );
}
