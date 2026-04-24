import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CANCEL_CLUB_ACCOUNTING_ENTRY,
  CLUB_ACCOUNTING_ACCOUNTS,
  CLUB_ACCOUNTING_COHORTS,
  CLUB_ACCOUNTING_ENTRIES,
  CLUB_ACCOUNTING_SUMMARY,
  CREATE_CLUB_ACCOUNTING_ENTRY,
} from '../../lib/documents';
import type {
  AccountingEntry,
  ClubAccountingAccountsData,
  ClubAccountingCohortsData,
  ClubAccountingEntriesData,
  ClubAccountingSummaryData,
} from '../../lib/types';
import { useToast } from '../../components/ToastProvider';
import { ConfirmModal, Drawer, EmptyState } from '../../components/ui';
import { downloadCsv, toCsv } from '../../lib/csv-export';

type Period = 'ALL' | 'MONTH' | 'YEAR' | 'CUSTOM';

function computeRange(
  period: Period,
  customFrom: string,
  customTo: string,
): { from: string | null; to: string | null } {
  const now = new Date();
  if (period === 'MONTH') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (period === 'YEAR') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (period === 'CUSTOM') {
    return {
      from: customFrom ? new Date(customFrom + 'T00:00:00Z').toISOString() : null,
      to: customTo
        ? new Date(
            new Date(customTo + 'T00:00:00Z').getTime() + 24 * 3600 * 1000,
          ).toISOString()
        : null,
    };
  }
  return { from: null, to: null };
}

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

function sourceLabel(source: string): string {
  switch (source) {
    case 'MANUAL':
      return 'Saisie';
    case 'OCR_AI':
      return 'OCR IA';
    case 'AUTO_MEMBER_PAYMENT':
      return 'Cotisation';
    case 'AUTO_SUBSIDY':
      return 'Subvention';
    case 'AUTO_SPONSORSHIP':
      return 'Sponsor';
    case 'AUTO_SHOP':
      return 'Boutique';
    case 'AUTO_REFUND':
      return 'Avoir';
    case 'AUTO_STRIPE_FEES':
      return 'Frais Stripe';
    default:
      return source;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'DRAFT':
      return 'Brouillon';
    case 'NEEDS_REVIEW':
      return 'À valider';
    case 'POSTED':
      return 'Validée';
    case 'LOCKED':
      return 'Verrouillée';
    case 'CANCELLED':
      return 'Annulée';
    default:
      return status;
  }
}

export function AccountingPage() {
  const { showToast } = useToast();
  const [period, setPeriod] = useState<Period>('ALL');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const range = useMemo(
    () => computeRange(period, customFrom, customTo),
    [period, customFrom, customTo],
  );
  const { data: entriesData, refetch: refetchEntries, loading } =
    useQuery<ClubAccountingEntriesData>(CLUB_ACCOUNTING_ENTRIES, {
      fetchPolicy: 'cache-and-network',
      variables: { from: range.from, to: range.to },
    });
  const { data: summaryData, refetch: refetchSummary } =
    useQuery<ClubAccountingSummaryData>(CLUB_ACCOUNTING_SUMMARY, {
      fetchPolicy: 'cache-and-network',
      variables: { from: range.from, to: range.to },
    });
  const { data: accountsData } = useQuery<ClubAccountingAccountsData>(
    CLUB_ACCOUNTING_ACCOUNTS,
    { fetchPolicy: 'cache-and-network' },
  );
  const { data: cohortsData } = useQuery<ClubAccountingCohortsData>(
    CLUB_ACCOUNTING_COHORTS,
    { fetchPolicy: 'cache-and-network' },
  );
  const [create, { loading: creating }] = useMutation(
    CREATE_CLUB_ACCOUNTING_ENTRY,
  );
  const [cancel] = useMutation(CANCEL_CLUB_ACCOUNTING_ENTRY);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<AccountingEntry | null>(null);
  const [kindFilter, setKindFilter] = useState<
    'ALL' | 'INCOME' | 'EXPENSE' | 'IN_KIND'
  >('ALL');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'NEEDS_REVIEW' | 'POSTED' | 'LOCKED' | 'CANCELLED'
  >('ALL');

  const [kind, setKind] = useState<'INCOME' | 'EXPENSE' | 'IN_KIND'>(
    'EXPENSE',
  );
  const [label, setLabel] = useState('');
  const [amountEuros, setAmountEuros] = useState('');
  const [occurredOn, setOccurredOn] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [cohortCode, setCohortCode] = useState('');
  const [disciplineCode, setDisciplineCode] = useState('');
  const [freeformTagsStr, setFreeformTagsStr] = useState('');

  const entries = entriesData?.clubAccountingEntries ?? [];
  const filtered = useMemo(() => {
    let rows = entries;
    if (kindFilter !== 'ALL')
      rows = rows.filter((e) => e.kind === kindFilter);
    if (statusFilter !== 'ALL')
      rows = rows.filter((e) => e.status === statusFilter);
    return rows;
  }, [entries, kindFilter, statusFilter]);
  const summary = summaryData?.clubAccountingSummary;
  const accounts = accountsData?.clubAccountingAccounts ?? [];
  const cohorts = cohortsData?.clubAccountingCohorts ?? [];

  // Filtre les comptes selon le kind sélectionné
  const availableAccounts = useMemo(() => {
    if (kind === 'INCOME')
      return accounts.filter((a) => a.kind === 'INCOME' && a.isActive);
    if (kind === 'EXPENSE')
      return accounts.filter((a) => a.kind === 'EXPENSE' && a.isActive);
    if (kind === 'IN_KIND')
      return accounts.filter(
        (a) => a.kind === 'NEUTRAL_IN_KIND' && a.isActive,
      );
    return accounts;
  }, [accounts, kind]);

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
    if (!accountCode) {
      showToast('Compte comptable requis', 'error');
      return;
    }
    const amountCents = parseEuros(amountEuros);
    if (amountCents === null) {
      showToast('Montant invalide', 'error');
      return;
    }
    const tags = freeformTagsStr
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      await create({
        variables: {
          input: {
            kind,
            label: l,
            amountCents,
            accountCode,
            ...(occurredOn
              ? { occurredAt: new Date(occurredOn).toISOString() }
              : {}),
            ...(cohortCode ? { cohortCode } : {}),
            ...(disciplineCode ? { disciplineCode } : {}),
            ...(tags.length > 0 ? { freeformTags: tags } : {}),
          },
        },
      });
      showToast('Écriture enregistrée', 'success');
      setDrawerOpen(false);
      setLabel('');
      setAmountEuros('');
      setOccurredOn('');
      setKind('EXPENSE');
      setAccountCode('');
      setCohortCode('');
      setDisciplineCode('');
      setFreeformTagsStr('');
      await Promise.all([refetchEntries(), refetchSummary()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doCancel() {
    if (!confirmDel) return;
    try {
      await cancel({
        variables: {
          input: {
            id: confirmDel.id,
            reason: 'Annulation via UI',
          },
        },
      });
      showToast('Écriture annulée', 'success');
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
          <h1 className="cf-page-title">Comptabilité analytique</h1>
          <p className="cf-page-subtitle">
            Les encaissements de cotisation sont ventilés automatiquement par
            cohorte, sexe et discipline. Ajoutez vos dépenses manuellement ou
            via OCR (bientôt).
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
          {summary.inKindCents > 0 ? (
            <div className="cf-acct-summary__card">
              <span>Contributions nature</span>
              <strong>{fmtEuros(summary.inKindCents)}</strong>
            </div>
          ) : null}
          {summary.needsReviewCount > 0 ? (
            <div
              className="cf-acct-summary__card"
              style={{ background: 'rgba(255, 180, 0, 0.08)' }}
            >
              <span>À valider</span>
              <strong>{summary.needsReviewCount}</strong>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="cf-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
        <label className="cf-field cf-field--inline">
          <span>Type</span>
          <select
            value={kindFilter}
            onChange={(e) =>
              setKindFilter(
                e.target.value as 'ALL' | 'INCOME' | 'EXPENSE' | 'IN_KIND',
              )
            }
          >
            <option value="ALL">Tous</option>
            <option value="INCOME">Recettes</option>
            <option value="EXPENSE">Dépenses</option>
            <option value="IN_KIND">Nature (870/871)</option>
          </select>
        </label>
        <label className="cf-field cf-field--inline">
          <span>Statut</span>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as
                  | 'ALL'
                  | 'NEEDS_REVIEW'
                  | 'POSTED'
                  | 'LOCKED'
                  | 'CANCELLED',
              )
            }
          >
            <option value="ALL">Tous</option>
            <option value="POSTED">Validées</option>
            <option value="NEEDS_REVIEW">À valider</option>
            <option value="LOCKED">Verrouillées</option>
            <option value="CANCELLED">Annulées</option>
          </select>
        </label>
        <label className="cf-field cf-field--inline">
          <span>Période</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
          >
            <option value="ALL">Depuis le début</option>
            <option value="MONTH">Ce mois</option>
            <option value="YEAR">Cette année</option>
            <option value="CUSTOM">Personnalisée…</option>
          </select>
        </label>
        {period === 'CUSTOM' ? (
          <>
            <label className="cf-field cf-field--inline">
              <span>Du</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label className="cf-field cf-field--inline">
              <span>Au</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
          </>
        ) : null}
        <button
          type="button"
          className="cf-btn cf-btn--ghost"
          onClick={() => {
            const csv = toCsv(
              ['Date', 'Libellé', 'Type', 'Statut', 'Source', 'Montant (€)', 'Compte'],
              filtered.map((e) => [
                e.occurredAt.slice(0, 10),
                e.label,
                e.kind,
                statusLabel(e.status),
                sourceLabel(e.source),
                ((e.kind === 'INCOME' ? 1 : -1) * (e.amountCents / 100)).toFixed(
                  2,
                ),
                e.lines[0]?.accountCode ?? '',
              ]),
            );
            const ts = new Date().toISOString().slice(0, 10);
            downloadCsv(`comptabilite-${ts}.csv`, csv);
          }}
          disabled={!filtered.length}
          style={{ marginLeft: 'auto' }}
        >
          <span className="material-symbols-outlined">download</span>
          Exporter CSV
        </button>
      </div>

      {loading && entries.length === 0 ? (
        <p className="cf-muted">Chargement…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="account_balance"
          title="Aucune écriture"
          message="Les cotisations sont ventilées automatiquement. Ajoutez vos dépenses manuellement."
        />
      ) : (
        <table className="cf-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Libellé</th>
              <th>Compte</th>
              <th>Statut</th>
              <th>Source</th>
              <th style={{ textAlign: 'right' }}>Montant</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const firstLine = e.lines[0];
              const firstAlloc = firstLine?.allocations[0];
              return (
                <tr key={e.id}>
                  <td>{fmtDate(e.occurredAt)}</td>
                  <td>
                    <div>{e.label}</div>
                    {firstAlloc && firstAlloc.cohortCode ? (
                      <small className="cf-muted">
                        {firstAlloc.cohortCode}
                        {firstAlloc.disciplineCode
                          ? ` · ${firstAlloc.disciplineCode}`
                          : ''}
                        {firstAlloc.projectTitle
                          ? ` · ${firstAlloc.projectTitle}`
                          : ''}
                      </small>
                    ) : null}
                  </td>
                  <td>
                    {firstLine ? (
                      <small title={firstLine.accountLabel}>
                        {firstLine.accountCode}
                      </small>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <span
                      className={`cf-pill cf-pill--${
                        e.status === 'POSTED'
                          ? 'ok'
                          : e.status === 'NEEDS_REVIEW'
                            ? 'warn'
                            : 'muted'
                      }`}
                    >
                      {statusLabel(e.status)}
                    </span>
                  </td>
                  <td>
                    <small className="cf-muted">{sourceLabel(e.source)}</small>
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {e.kind === 'INCOME' ? '+' : e.kind === 'EXPENSE' ? '−' : '='}{' '}
                    {fmtEuros(e.amountCents)}
                  </td>
                  <td>
                    {e.status === 'CANCELLED' || e.status === 'LOCKED' ? (
                      <span className="cf-muted">—</span>
                    ) : e.source === 'MANUAL' || e.source === 'OCR_AI' ? (
                      <button
                        type="button"
                        className="btn-ghost btn-ghost--danger"
                        onClick={() => setConfirmDel(e)}
                      >
                        Annuler
                      </button>
                    ) : (
                      <span className="cf-muted" title="Écriture automatique — crée une contre-passation pour corriger">
                        Auto
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
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
              onChange={(e) => {
                setKind(e.target.value as 'INCOME' | 'EXPENSE' | 'IN_KIND');
                setAccountCode(''); // reset compte quand type change
              }}
            >
              <option value="EXPENSE">Dépense</option>
              <option value="INCOME">Recette</option>
              <option value="IN_KIND">Contribution en nature</option>
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
            <span>Compte comptable *</span>
            <select
              value={accountCode}
              onChange={(e) => setAccountCode(e.target.value)}
              required
            >
              <option value="">— Choisir un compte —</option>
              {availableAccounts.map((a) => (
                <option key={a.id} value={a.code}>
                  {a.code} — {a.label}
                </option>
              ))}
            </select>
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
          <fieldset className="cf-fieldset">
            <legend>Analytique (optionnel)</legend>
            <label className="cf-field">
              <span>Cohorte</span>
              <select
                value={cohortCode}
                onChange={(e) => setCohortCode(e.target.value)}
              >
                <option value="">— Aucune —</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="cf-field">
              <span>Discipline</span>
              <input
                type="text"
                value={disciplineCode}
                onChange={(e) => setDisciplineCode(e.target.value)}
                placeholder="ex: karate, judo"
              />
            </label>
            <label className="cf-field">
              <span>Tags (séparés par virgule)</span>
              <input
                type="text"
                value={freeformTagsStr}
                onChange={(e) => setFreeformTagsStr(e.target.value)}
                placeholder="ex: gala, tournoi"
              />
            </label>
          </fieldset>
          <button type="submit" style={{ display: 'none' }} />
        </form>
      </Drawer>

      <ConfirmModal
        open={confirmDel !== null}
        title="Annuler cette écriture ?"
        message={
          confirmDel
            ? `${confirmDel.label} — L'écriture sera marquée comme annulée (conservée en base pour audit).`
            : undefined
        }
        confirmLabel="Annuler l'écriture"
        danger
        onConfirm={() => void doCancel()}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}
