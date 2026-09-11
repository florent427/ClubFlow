import { useState } from 'react';
import type { FormEvent } from 'react';
import type { AccountingAccountRow, BankStatementLine } from '../../../lib/types';
import { formatEuro } from './format';

type Props = {
  line: BankStatementLine;
  accounts: AccountingAccountRow[];
  busy: boolean;
  onAccept: (overrides?: { accountCode?: string; label?: string }) => void;
  onReject: () => void;
  onAnswer: (answer: string) => void;
  onCategorize: () => void;
};

/**
 * Ce que l'IA ou une règle propose pour une ligne sans écriture, et les
 * trois gestes possibles : valider, corriger, rejeter. Quand l'IA doute,
 * elle pose une question ici même plutôt que de deviner.
 */
export function ProposalCard({
  line,
  accounts,
  busy,
  onAccept,
  onReject,
  onAnswer,
  onCategorize,
}: Props) {
  const [answer, setAnswer] = useState('');
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');

  if (line.status !== 'UNMATCHED') return null;

  if (line.question) {
    return (
      <div className="members-panel" style={{ padding: 10, background: '#eff6ff', margin: 0 }}>
        <div style={{ marginBottom: 6 }}>
          <strong>L’IA demande :</strong> {line.question}
        </div>
        {line.conversation.length > 1 ? (
          <details style={{ marginBottom: 6 }}>
            <summary className="cf-muted">Échange précédent</summary>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: '0.85rem' }}>
              {line.conversation.map((t, i) => (
                <li key={i}>
                  <span className="cf-muted">{t.role === 'USER' ? 'Toi' : 'IA'} : </span>
                  {t.text}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (answer.trim()) {
              onAnswer(answer.trim());
              setAnswer('');
            }
          }}
          style={{ display: 'flex', gap: 8 }}
        >
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Ta réponse, en une phrase"
            maxLength={500}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn-primary" disabled={busy || !answer.trim()}>
            Répondre
          </button>
        </form>
      </div>
    );
  }

  const p = line.proposal;
  if (!p) {
    if (line.aiExhausted) {
      return (
        <div className="cf-muted" style={{ padding: '6px 0' }}>
          Catégorisation abandonnée : rapproche cette ligne d’une écriture, ignore-la, ou{' '}
          <button type="button" className="btn-ghost btn-ghost--sm" disabled={busy} onClick={onCategorize}>
            relance la catégorisation
          </button>
          .
        </div>
      );
    }
    return (
      <div className="cf-muted" style={{ padding: '6px 0' }}>
        Pas encore de proposition.{' '}
        <button type="button" className="btn-ghost btn-ghost--sm" disabled={busy} onClick={onCategorize}>
          Proposer un compte
        </button>
      </div>
    );
  }

  const badge = p.source === 'RULE' ? 'Règle du club' : `IA · ${p.models.length} modèle(s)`;

  return (
    <div
      className="members-panel"
      style={{
        padding: 10,
        margin: 0,
        background: p.clear ? '#f0fdf4' : '#fffbeb',
        borderLeft: `3px solid ${p.clear ? '#166534' : '#b45309'}`,
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong>
          {p.accountCode} {p.accountLabel}
        </strong>
        <span>{p.label}</span>
        <span className={p.clear ? 'cf-pill cf-pill--ok' : 'cf-pill cf-pill--warn'}>
          {badge} · {p.confidencePct} %
        </span>
        {p.projectTitle ? <span className="cf-pill cf-pill--muted">{p.projectTitle}</span> : null}
        {!p.clear ? <span className="cf-muted">à revoir avant de valider</span> : null}
      </div>
      {p.reasoning ? (
        <div className="cf-muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
          {p.reasoning}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => onAccept()}>
          Valider
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={busy}
          onClick={() => {
            setCode(p.accountCode);
            setLabel(p.label);
            setEditing((v) => !v);
          }}
        >
          {editing ? 'Annuler' : 'Corriger…'}
        </button>
        <button type="button" className="btn-ghost" style={{ color: '#b91c1c' }} disabled={busy} onClick={onReject}>
          Rejeter
        </button>
      </div>
      {editing ? (
        <form
          className="cf-form-row"
          style={{ marginTop: 8, alignItems: 'flex-end' }}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            onAccept({ accountCode: code, label: label.trim() || undefined });
            setEditing(false);
          }}
        >
          <label className="cf-field" style={{ flex: '1 1 260px' }}>
            <span>Compte</span>
            <select value={code} onChange={(e) => setCode(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.code}>
                  {a.code} — {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="cf-field" style={{ flex: '2 1 260px' }}>
            <span>Libellé de l’écriture</span>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={200} />
          </label>
          <button type="submit" className="btn-primary" disabled={busy}>
            Valider ce choix
          </button>
        </form>
      ) : null}
      <div className="cf-muted" style={{ fontSize: '0.8rem', marginTop: 6 }}>
        Valider comptabilise {formatEuro(Math.abs(line.amountCents))} et rapproche la ligne.
      </div>
    </div>
  );
}
