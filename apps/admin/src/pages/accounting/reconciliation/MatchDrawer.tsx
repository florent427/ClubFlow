import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
import { BANK_LINE_CANDIDATES, MATCH_BANK_LINE } from '../../../lib/documents';
import type {
  BankLineCandidate,
  BankLineCandidatesData,
  BankStatementLine,
} from '../../../lib/types';
import { useToast } from '../../../components/ToastProvider';
import { Drawer } from '../../../components/ui';
import { centsToInput, formatEuro, formatFr, formatSigned, inputToCents } from './format';

type Props = {
  line: BankStatementLine | null;
  onClose: () => void;
  onMatched: () => Promise<unknown> | void;
};

const SOURCE_LABELS: Record<string, string> = {
  AUTO_MEMBER_PAYMENT: 'Encaissement adhérent',
  AUTO_STRIPE_PAYOUT: 'Virement Stripe',
  AUTO_STRIPE_FEES: 'Frais Stripe',
  CHEQUE_DEPOSIT: 'Remise de chèques',
  AUTO_SUBSIDY: 'Subvention',
  AUTO_SPONSORSHIP: 'Sponsoring',
  AUTO_SHOP: 'Boutique',
  AUTO_REFUND: 'Remboursement',
  OCR_AI: 'Reçu scanné',
  MANUAL: 'Saisie manuelle',
  BANK_IMPORT: 'Depuis un relevé',
};

/**
 * Rapprochement manuel d'une ligne (ADR-0014 §2) : N écritures pour une
 * ligne, chacune pour une part ; la somme des parts couvre exactement la
 * ligne. Les candidats viennent du même compte, dans une fenêtre large.
 */
export function MatchDrawer({ line, onClose, onMatched }: Props) {
  const { showToast } = useToast();
  const { data, loading } = useQuery<BankLineCandidatesData>(BANK_LINE_CANDIDATES, {
    variables: { lineId: line?.id ?? '' },
    skip: !line,
    fetchPolicy: 'network-only',
  });
  const [matchMut, { loading: matching }] = useMutation(MATCH_BANK_LINE);
  const [parts, setParts] = useState<Record<string, string>>({});

  useEffect(() => {
    setParts({});
  }, [line?.id]);

  const target = line ? Math.abs(line.amountCents) : 0;
  const candidates = useMemo(() => {
    const all = data?.bankLineCandidates ?? [];
    const suggested = new Set(line?.candidateEntryIds ?? []);
    return [...all].sort(
      (a, b) =>
        Number(b.strong) - Number(a.strong) ||
        Number(suggested.has(b.entryId)) - Number(suggested.has(a.entryId)),
    );
  }, [data, line]);

  const total = Object.values(parts).reduce((s, v) => {
    const c = inputToCents(v);
    return s + (c !== null && !Number.isNaN(c) ? c : 0);
  }, 0);
  const remaining = target - total;

  function toggle(c: BankLineCandidate) {
    setParts((prev) => {
      const next = { ...prev };
      if (next[c.entryId] !== undefined) {
        delete next[c.entryId];
      } else {
        const missing = Math.max(0, target - Object.values(next).reduce((s, v) => s + (inputToCents(v) ?? 0), 0));
        next[c.entryId] = centsToInput(Math.min(c.remainingCents, missing || c.remainingCents));
      }
      return next;
    });
  }

  async function onSubmit() {
    if (!line) return;
    const allocations = Object.entries(parts)
      .map(([entryId, v]) => ({ entryId, amountCents: inputToCents(v) ?? 0 }))
      .filter((a) => a.amountCents > 0);
    if (allocations.length === 0) {
      showToast('Choisis au moins une écriture', 'error');
      return;
    }
    try {
      await matchMut({ variables: { input: { lineId: line.id, allocations } } });
      showToast('Ligne rapprochée', 'success');
      await onMatched();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Rapprochement impossible', 'error');
    }
  }

  return (
    <Drawer
      open={line !== null}
      onClose={onClose}
      title="Rapprocher la ligne"
      footer={
        <div className="cf-drawer-foot">
          <span className="cf-muted" style={{ marginRight: 'auto' }}>
            Affecté {formatEuro(total)} / {formatEuro(target)}
            {remaining !== 0 ? ` (reste ${formatSigned(remaining)})` : ''}
          </span>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={matching || remaining !== 0 || total === 0}
            onClick={() => void onSubmit()}
          >
            Rapprocher
          </button>
        </div>
      }
    >
      {line ? (
        <div className="cf-form">
          <div className="members-panel" style={{ padding: 12 }}>
            <strong>{formatFr(line.bookedOn)}</strong> · {line.label}
            {line.reference ? <small className="cf-muted"> · réf. {line.reference}</small> : null}
            <div style={{ fontSize: '1.1rem', marginTop: 4, color: line.amountCents < 0 ? '#991b1b' : '#166534' }}>
              {formatSigned(line.amountCents)}
            </div>
          </div>
          <p className="cf-muted">
            Écritures du même compte, non rapprochées, dans une fenêtre de 45 jours.
            Coche une ou plusieurs écritures ; ajuste la part si une écriture n’est
            couverte qu’en partie par cette ligne.
          </p>
          {loading ? (
            <p className="cf-muted">Recherche…</p>
          ) : candidates.length === 0 ? (
            <p className="cf-muted">
              Aucune écriture candidate. Cette ligne n’a peut-être pas encore
              d’écriture : saisis-la dans Comptabilité, ou ignore-la si elle ne
              concerne pas le club.
            </p>
          ) : (
            <table className="cf-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }} />
                  <th>Date</th>
                  <th>Écriture</th>
                  <th style={{ textAlign: 'right' }}>Reste</th>
                  <th style={{ width: 130 }}>Part (€)</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const checked = parts[c.entryId] !== undefined;
                  const suggested = line.candidateEntryIds.includes(c.entryId);
                  return (
                    <tr key={c.entryId}>
                      <td>
                        <input type="checkbox" checked={checked} onChange={() => toggle(c)} aria-label={`Choisir ${c.label}`} />
                      </td>
                      <td>{new Date(c.occurredAt).toLocaleDateString('fr-FR')}</td>
                      <td>
                        <strong>{c.label}</strong>
                        <small className="cf-muted" style={{ display: 'block' }}>
                          {SOURCE_LABELS[c.source] ?? c.source} · {formatEuro(c.amountCents)}
                          {c.strong ? ' · clé forte' : suggested ? ' · suggérée' : ''}
                        </small>
                      </td>
                      <td style={{ textAlign: 'right' }}>{formatEuro(c.remainingCents)}</td>
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={parts[c.entryId] ?? ''}
                          disabled={!checked}
                          onChange={(e) => setParts((prev) => ({ ...prev, [c.entryId]: e.target.value }))}
                          style={{ width: '100%', textAlign: 'right' }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </Drawer>
  );
}
