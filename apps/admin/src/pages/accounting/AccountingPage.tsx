import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CLUB_ACCOUNTING_ENTRIES,
  CLUB_ACCOUNTING_SUMMARY,
  CREATE_CLUB_ACCOUNTING_ENTRY,
  DELETE_CLUB_ACCOUNTING_ENTRY,
} from '../../lib/documents';
import type {
  AccountingEntry,
  ClubAccountingEntriesData,
  ClubAccountingSummaryData,
} from '../../lib/types';
import { useToast } from '../../components/ToastProvider';
import { ConfirmModal, Drawer, EmptyState } from '../../components/ui';

function fmtEuros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'medium' });
  } catch {
    return '—';
  }
}

export function AccountingPage() {
  const { showToast } = useToast();
  const { data: entriesData, refetch: refetchEntries, loading } =
    useQuery<ClubAccountingEntriesData>(CLUB_ACCOUNTING_ENTRIES, {
      fetchPolicy: 'cache-and-network',
    });
  const { data: summaryData, refetch: refetchSummary } =
    useQuery<ClubAccountingSummaryData>(CLUB_ACCOUNTING_SUMMARY, {
      fetchPolicy: 'cache-and-network',
    });
  const [create, { loading: creating }] = useMutation(
    CREATE_CLUB_ACCOUNTING_ENTRY,
  );
  const [remove] = useMutation(DELETE_CLUB_ACCOUNTING_ENTRY);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<AccountingEntry | null>(null);
  const [kindFilter, setKindFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');

  const [kind, setKind] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [label, setLabel] = useState('');
  const [amountEuros, setAmountEuros] = useState('');
  const [occurredOn, setOccurredOn] = useState('');

  const entries = entriesData?.clubAccountingEntries ?? [];
  const filtered = useMemo(
    () => (kindFilter === 'ALL' ? entries : entries.filter((e) => e.kind === kindFilter)),
    [entries, kindFilter],
  );
  const summary = summaryData?.clubAccountingSummary;

  function parseEuros(s: string): number | null {
    const cleaned = s.trim().replace(/\s/g, '').replace(',', '.');
    if (!cleaned) return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const l = label.trim();
    if (l.length === 0) {
      showToast('Libellé requis', 'error');
      return;
    }
    const amountCents = parseEuros(amountEuros);
    if (amountCents === null) {
      showToast('Montant invalide', 'error');
      return;
    }
    try {
      await create({
        variables: {
          input: {
            kind,
            label: l,
            amountCents,
            ...(occurredOn ? { occurredAt: new Date(occurredOn).toISOString() } : {}),
          },
        },
      });
      showToast('Écriture enregistrée', 'success');
      setDrawerOpen(false);
      setLabel('');
      setAmountEuros('');
      setOccurredOn('');
      setKind('EXPENSE');
      await Promise.all([refetchEntries(), refetchSummary()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doDelete() {
    if (!confirmDel) return;
    try {
      await remove({ variables: { id: confirmDel.id } });
      showToast('Écriture supprimée', 'success');
      setConfirmDel(null);
      await Promise.all([refetchEntries(), refetchSummary()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  return (
    <div className="cf-page">
      <header className="cf-page-header">
        <div>
          <h1 className="cf-page-title">Comptabilité</h1>
          <p className="cf-page-subtitle">
            Les paiements encaissés génèrent automatiquement une écriture de recette.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setDrawerOpen(true)}>
          <span className="material-symbols-outlined" aria-hidden>add</span>
          Nouvelle écriture
        </button>
      </header>

      {summary ? (
        <div className="cf-acct-summary">
          <div className="cf-acct-summary__card cf-acct-summary__card--income">
            <span>Recettes</span>
            <strong>{fmtEuros(summary.incomeCents)}</strong>
          </div>
          <div className="cf-acct-summary__card cf-acct-summary__card--expense">
            <span>Dépenses</span>
            <strong>{fmtEuros(summary.expenseCents)}</strong>
          </div>
          <div className="cf-acct-summary__card cf-acct-summary__card--balance">
            <span>Solde</span>
            <strong>{fmtEuros(summary.balanceCents)}</strong>
          </div>
        </div>
      ) : null}

      <div className="cf-toolbar">
        <label className="cf-field cf-field--inline">
          <span>Filtre</span>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as 'ALL' | 'INCOME' | 'EXPENSE')}
          >
            <option value="ALL">Toutes</option>
            <option value="INCOME">Recettes</option>
            <option value="EXPENSE">Dépenses</option>
          </select>
        </label>
      </div>

      {loading && entries.length === 0 ? (
        <p className="cf-muted">Chargement…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="account_balance"
          title="Aucune écriture"
          description="Les recettes sont créées automatiquement, ajoutez vos dépenses manuellement."
        />
      ) : (
        <table className="cf-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Libellé</th>
              <th>Type</th>
              <th style={{ textAlign: 'right' }}>Montant</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td>{fmtDate(e.occurredAt)}</td>
                <td>{e.label}</td>
                <td>
                  <span
                    className={`cf-pill cf-pill--${e.kind === 'INCOME' ? 'ok' : 'warn'}`}
                  >
                    {e.kind === 'INCOME' ? 'Recette' : 'Dépense'}
                  </span>
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {e.kind === 'INCOME' ? '+' : '−'} {fmtEuros(e.amountCents)}
                </td>
                <td>
                  {e.paymentId ? (
                    <span className="cf-muted" title="Écriture liée à un paiement">
                      Auto
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn-ghost btn-ghost--danger"
                      onClick={() => setConfirmDel(e)}
                    >
                      Supprimer
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Nouvelle écriture"
        footer={
          <div className="cf-drawer-foot">
            <button type="button" className="btn-ghost" onClick={() => setDrawerOpen(false)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={creating}
              form="cf-acct-form"
            >
              Créer
            </button>
          </div>
        }
      >
        <form id="cf-acct-form" onSubmit={onSubmit} className="cf-form">
          <label className="cf-field">
            <span>Type *</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as 'INCOME' | 'EXPENSE')}
            >
              <option value="EXPENSE">Dépense</option>
              <option value="INCOME">Recette</option>
            </select>
          </label>
          <label className="cf-field">
            <span>Libellé *</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={200}
              required
            />
          </label>
          <label className="cf-field">
            <span>Montant (€) *</span>
            <input
              type="text"
              inputMode="decimal"
              value={amountEuros}
              onChange={(e) => setAmountEuros(e.target.value)}
              placeholder="ex : 120,50"
              required
            />
          </label>
          <label className="cf-field">
            <span>Date</span>
            <input
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
            />
          </label>
          <button type="submit" style={{ display: 'none' }} />
        </form>
      </Drawer>

      <ConfirmModal
        open={confirmDel !== null}
        title="Supprimer cette écriture ?"
        message={confirmDel ? confirmDel.label : undefined}
        confirmLabel="Supprimer"
        danger
        onConfirm={() => void doDelete()}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}
