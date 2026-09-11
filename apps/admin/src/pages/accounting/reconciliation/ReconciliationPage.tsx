import { useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CLUB_BANK_STATEMENTS,
  CLUB_FINANCIAL_ACCOUNTS,
  CLUB_RECONCILIATION_SUMMARY,
} from '../../../lib/documents';
import type {
  ClubBankStatementsData,
  ClubFinancialAccountsData,
  ClubReconciliationSummaryData,
} from '../../../lib/types';
import {
  STATEMENT_STATUS_LABELS,
  formatEuro,
  formatFr,
  formatSigned,
  statementStatusPill,
} from './format';
import { ImportStatementDrawer } from './ImportStatementDrawer';
import { StripeTransitPanel } from './StripeTransitPanel';

/**
 * Rapprochement bancaire (ADR-0014) : par compte bancaire, où en est-on ;
 * la chaîne des relevés déposés ; le dépôt d'un nouveau relevé.
 */
export function ReconciliationPage() {
  const navigate = useNavigate();
  const { data: summaryData, refetch: refetchSummary } =
    useQuery<ClubReconciliationSummaryData>(CLUB_RECONCILIATION_SUMMARY, {
      fetchPolicy: 'cache-and-network',
    });
  const { data: statementsData, refetch: refetchStatements } =
    useQuery<ClubBankStatementsData>(CLUB_BANK_STATEMENTS, {
      variables: { financialAccountId: null },
      fetchPolicy: 'cache-and-network',
    });
  const { data: finData } = useQuery<ClubFinancialAccountsData>(CLUB_FINANCIAL_ACCOUNTS, {
    fetchPolicy: 'cache-and-network',
  });

  const summary = summaryData?.clubReconciliationSummary ?? [];
  const statements = statementsData?.clubBankStatements ?? [];
  const bankAccounts = useMemo(
    () => (finData?.clubFinancialAccounts ?? []).filter((a) => a.isActive && a.kind === 'BANK'),
    [finData],
  );

  const [importOpen, setImportOpen] = useState(false);
  const [importAccountId, setImportAccountId] = useState<string | null>(null);

  function openImport(accountId: string | null) {
    setImportAccountId(accountId);
    setImportOpen(true);
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <p className="members-loom__eyebrow">Comptabilité</p>
        <h1 className="members-loom__title">Rapprochement bancaire</h1>
        <p className="members-loom__lede">
          Dépose les relevés de chaque banque. Chaque ligne est rapprochée d’une
          écriture existante ; ce qui reste est à traiter. Le relevé est la
          source de vérité du compte.
        </p>
      </header>

      <section className="members-panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 className="members-panel__h" style={{ margin: 0 }}>
            Comptes bancaires
          </h2>
          <button
            type="button"
            className="btn-primary"
            disabled={bankAccounts.length === 0}
            onClick={() => openImport(null)}
          >
            + Déposer un relevé
          </button>
        </div>
        {summary.length === 0 ? (
          <p className="cf-muted">
            Aucun compte bancaire actif. Crée-le dans Paramètres → Comptabilité.
          </p>
        ) : (
          <table className="cf-table">
            <thead>
              <tr>
                <th>Compte</th>
                <th>Solde d’ouverture</th>
                <th>Relevés</th>
                <th>Dernier relevé</th>
                <th>Lignes à traiter</th>
                <th>Écritures non rapprochées</th>
                <th style={{ width: 160 }} />
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.financialAccountId}>
                  <td>
                    <strong>{s.label}</strong>
                    <small className="cf-muted" style={{ display: 'block' }}>
                      {s.accountingAccountCode}
                    </small>
                  </td>
                  <td>
                    {s.openingBalanceSet ? (
                      <span className="cf-pill cf-pill--ok">renseigné</span>
                    ) : (
                      <Link to="/settings/accounting" className="cf-pill cf-pill--warn">
                        à renseigner
                      </Link>
                    )}
                  </td>
                  <td>{s.statementCount}</td>
                  <td>
                    {s.lastPeriodEnd ? (
                      <>
                        {formatFr(s.lastPeriodEnd)}{' '}
                        {s.lastStatus ? (
                          <span className={statementStatusPill(s.lastStatus)}>{STATEMENT_STATUS_LABELS[s.lastStatus]}</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="cf-muted">aucun</span>
                    )}
                  </td>
                  <td>
                    {s.linesToHandle > 0 ? (
                      <span className="cf-pill cf-pill--warn">{s.linesToHandle}</span>
                    ) : (
                      <span className="cf-muted">0</span>
                    )}
                  </td>
                  <td>
                    {s.unreconciledEntries > 0 ? s.unreconciledEntries : <span className="cf-muted">0</span>}
                  </td>
                  <td>
                    <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => openImport(s.financialAccountId)}>
                      Déposer un relevé
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <StripeTransitPanel
        onSynced={() => {
          void refetchSummary();
          void refetchStatements();
        }}
      />

      <section className="members-panel">
        <h2 className="members-panel__h">Relevés déposés</h2>
        {statements.length === 0 ? (
          <p className="cf-muted">Aucun relevé pour l’instant.</p>
        ) : (
          <table className="cf-table">
            <thead>
              <tr>
                <th>Compte</th>
                <th>Période</th>
                <th>Format</th>
                <th style={{ textAlign: 'right' }}>Début → fin</th>
                <th>Statut</th>
                <th>Lignes</th>
                <th style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {statements.map((s) => {
                const todo = s.unmatchedCount + s.suggestedCount;
                return (
                  <tr key={s.id}>
                    <td>{s.financialAccountLabel}</td>
                    <td>
                      {formatFr(s.periodStart)} → {formatFr(s.periodEnd)}
                    </td>
                    <td>{s.format}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {formatEuro(s.openingBalanceCents)} → {formatEuro(s.closingBalanceCents)}
                      {s.integrityDeltaCents !== null && s.integrityDeltaCents !== 0 ? (
                        <small style={{ display: 'block', color: '#b45309' }}>écart {formatSigned(s.integrityDeltaCents)}</small>
                      ) : null}
                    </td>
                    <td>
                      <span className={statementStatusPill(s.status)}>{STATEMENT_STATUS_LABELS[s.status]}</span>
                    </td>
                    <td>
                      {s.lineCount}
                      <small className="cf-muted" style={{ display: 'block' }}>
                        {todo > 0 ? `${todo} à traiter · ` : ''}
                        {s.matchedCount} rapprochée{s.matchedCount > 1 ? 's' : ''}
                        {s.ignoredCount > 0 ? ` · ${s.ignoredCount} ignorée${s.ignoredCount > 1 ? 's' : ''}` : ''}
                      </small>
                    </td>
                    <td>
                      <Link to={`/comptabilite/rapprochement/${s.id}`} className="btn-ghost btn-ghost--sm">
                        Ouvrir
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <ImportStatementDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        accounts={bankAccounts}
        defaultAccountId={importAccountId}
        onImported={(id) => {
          setImportOpen(false);
          void refetchSummary();
          void refetchStatements();
          navigate(`/comptabilite/rapprochement/${id}`);
        }}
      />
    </>
  );
}
