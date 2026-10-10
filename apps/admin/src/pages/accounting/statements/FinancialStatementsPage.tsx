import { useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { CLUB_FINANCIAL_STATEMENTS, CLUB_IDENTITY } from '../../../lib/documents';
import type {
  ClubFinancialStatementsData,
  ClubIdentityData,
  StatementLine,
  StatementSection,
} from '../../../lib/types';
import { formatEuro, formatFr, todayIso } from '../reconciliation/format';

const amountCell = { textAlign: 'right' as const, whiteSpace: 'nowrap' as const };

function LinesRows({ lines }: { lines: StatementLine[] }) {
  return (
    <>
      {lines.map((l) => (
        <tr key={`${l.accountCode}-${l.label}`}>
          <td style={{ paddingLeft: 24 }}>
            {l.accountCode ? <small className="cf-muted">{l.accountCode} </small> : null}
            {l.label}
          </td>
          <td style={amountCell}>{formatEuro(l.amountCents)}</td>
        </tr>
      ))}
    </>
  );
}

function SectionsTable({
  title,
  sections,
  totalLabel,
  totalCents,
  empty,
}: {
  title: string;
  sections: StatementSection[];
  totalLabel: string;
  totalCents: number;
  empty: string;
}) {
  return (
    <table className="cf-table fs-table">
      <thead>
        <tr>
          <th>{title}</th>
          <th style={{ ...amountCell, width: 140 }}>Montant</th>
        </tr>
      </thead>
      <tbody>
        {sections.length === 0 ? (
          <tr>
            <td colSpan={2}>
              <span className="cf-muted">{empty}</span>
            </td>
          </tr>
        ) : null}
        {sections.map((s) => (
          <SectionRows key={s.key} section={s} />
        ))}
        <tr className="fs-total">
          <td>
            <strong>{totalLabel}</strong>
          </td>
          <td style={amountCell}>
            <strong>{formatEuro(totalCents)}</strong>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function SectionRows({ section }: { section: StatementSection }) {
  return (
    <>
      <tr className="fs-section">
        <td>
          <strong>{section.label}</strong>
        </td>
        <td style={amountCell}>
          <strong>{formatEuro(section.totalCents)}</strong>
        </td>
      </tr>
      <LinesRows lines={section.lines} />
    </>
  );
}

/**
 * Bilan et compte de résultat provisoires à une date.
 *
 * « Provisoire » parce que rien n'est régularisé : ni charges ou produits
 * constatés d'avance, ni amortissements, et les écritures en attente de
 * validation sont laissées de côté. Le bilan ne s'équilibre que si les
 * soldes d'ouverture ont leur contrepartie en fonds associatifs.
 */
export function FinancialStatementsPage() {
  const [asOf, setAsOf] = useState(todayIso());
  const { data, loading, error } = useQuery<ClubFinancialStatementsData>(
    CLUB_FINANCIAL_STATEMENTS,
    { variables: { asOf }, skip: !asOf, fetchPolicy: 'cache-and-network' },
  );
  const { data: clubData } = useQuery<ClubIdentityData>(CLUB_IDENTITY);

  const fs = data?.clubFinancialStatements ?? null;
  const is = fs?.incomeStatement ?? null;
  const bs = fs?.balanceSheet ?? null;
  const resultLabel =
    is && is.resultCents < 0 ? 'Déficit provisoire' : 'Excédent provisoire';

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested no-print">
        <p className="members-loom__eyebrow">Comptabilité</p>
        <h1 className="members-loom__title">États financiers</h1>
        <p className="members-loom__lede">
          Bilan et compte de résultat provisoires, arrêtés au jour de ton
          choix. Ils se lisent sur les écritures validées : celles qui
          attendent une validation, les régularisations de fin d’exercice et
          les amortissements n’y sont pas.
        </p>
      </header>

      <div className="fs-print-header">
        <h1>{clubData?.club.name ?? ''}</h1>
        <p>
          Bilan et compte de résultat provisoires — arrêtés au{' '}
          {formatFr(fs?.asOf ?? asOf)}
          {fs ? ` — exercice ${fs.fiscalYearLabel}` : ''}
        </p>
      </div>

      <section className="members-panel no-print">
        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="cf-field">
              <span>Arrêté au</span>
              <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </label>
            {fs ? (
              <span className="cf-pill cf-pill--muted">
                Exercice {fs.fiscalYearLabel} : du {formatFr(fs.fiscalYearStartsOn)} au{' '}
                {formatFr(fs.fiscalYearEndsOn)}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={!fs}
            onClick={() => window.print()}
          >
            Exporter en PDF
          </button>
        </div>
      </section>

      {error ? (
        <section className="members-panel">
          <p className="cf-pill cf-pill--warn">Impossible de calculer les états : {error.message}</p>
        </section>
      ) : null}
      {!fs && loading ? (
        <section className="members-panel">
          <p className="cf-muted">Calcul en cours…</p>
        </section>
      ) : null}

      {fs && is && bs ? (
        <>
          {bs.imbalanceCents !== 0 ||
          fs.needsReviewCount > 0 ||
          fs.draftCount > 0 ||
          fs.financialAccountsWithoutOpening.length > 0 ||
          fs.unclassified.length > 0 ? (
            <section className="members-panel fs-warnings">
              <h2 className="members-panel__h">À savoir avant de lire</h2>
              <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
                {bs.imbalanceCents !== 0 ? (
                  <li>
                    <strong>Bilan déséquilibré de {formatEuro(Math.abs(bs.imbalanceCents))}</strong>{' '}
                    (actif {bs.imbalanceCents > 0 ? 'supérieur' : 'inférieur'} au passif) :
                    des à-nouveaux manquent. Un solde d’ouverture saisi sur un compte
                    financier n’a pas de contrepartie, le plus souvent en fonds
                    associatifs (102). Passe une écriture d’ouverture pour la reprendre.
                  </li>
                ) : null}
                {fs.financialAccountsWithoutOpening.length > 0 ? (
                  <li>
                    Sans solde d’ouverture :{' '}
                    {fs.financialAccountsWithoutOpening.join(', ')}. Leur solde part de
                    zéro. Renseigne-le dans Paramètres → Comptabilité → Exercice.
                  </li>
                ) : null}
                {fs.needsReviewCount > 0 ? (
                  <li>
                    {fs.needsReviewCount} écriture{fs.needsReviewCount > 1 ? 's' : ''} en
                    attente de validation ({formatEuro(fs.needsReviewCents)}), non
                    comptée{fs.needsReviewCount > 1 ? 's' : ''}.
                  </li>
                ) : null}
                {fs.draftCount > 0 ? (
                  <li>
                    {fs.draftCount} brouillon{fs.draftCount > 1 ? 's' : ''} non
                    compté{fs.draftCount > 1 ? 's' : ''}.
                  </li>
                ) : null}
                {fs.unclassified.length > 0 ? (
                  <li>
                    Comptes hors bilan et hors résultat :{' '}
                    {fs.unclassified
                      .map((u) => `${u.accountCode} ${u.label} (${formatEuro(u.amountCents)})`)
                      .join(', ')}
                    .
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}

          <section className="members-panel fs-block">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <h2 className="members-panel__h" style={{ margin: 0 }}>
                Compte de résultat
              </h2>
              <span className={`cf-pill ${is.resultCents < 0 ? 'cf-pill--warn' : 'cf-pill--ok'}`}>
                {resultLabel} : {formatEuro(is.resultCents)}
              </span>
            </div>
            <p className="cf-muted" style={{ marginTop: 4 }}>
              Du {formatFr(fs.fiscalYearStartsOn)} au {formatFr(fs.asOf)}.
            </p>
            <div className="fs-columns">
              <SectionsTable
                title="Charges"
                sections={is.expenses}
                totalLabel="Total des charges"
                totalCents={is.totalExpensesCents}
                empty="Aucune charge sur la période."
              />
              <SectionsTable
                title="Produits"
                sections={is.revenues}
                totalLabel="Total des produits"
                totalCents={is.totalRevenuesCents}
                empty="Aucun produit sur la période."
              />
            </div>

            {is.inKindUses.length > 0 || is.inKindContributions.length > 0 ? (
              <>
                <h3 style={{ margin: '20px 0 4px' }}>Contributions volontaires en nature</h3>
                <p className="cf-muted" style={{ marginTop: 0 }}>
                  Bénévolat, dons et prêts en nature : présentés en pied du compte
                  de résultat, sans effet sur le résultat.
                </p>
                <div className="fs-columns">
                  <SectionsTable
                    title="Emplois (86)"
                    sections={
                      is.inKindUses.length
                        ? [{ key: '86', label: 'Emplois', totalCents: is.totalInKindUsesCents, lines: is.inKindUses }]
                        : []
                    }
                    totalLabel="Total des emplois"
                    totalCents={is.totalInKindUsesCents}
                    empty="—"
                  />
                  <SectionsTable
                    title="Contributions (87)"
                    sections={
                      is.inKindContributions.length
                        ? [
                            {
                              key: '87',
                              label: 'Contributions',
                              totalCents: is.totalInKindContributionsCents,
                              lines: is.inKindContributions,
                            },
                          ]
                        : []
                    }
                    totalLabel="Total des contributions"
                    totalCents={is.totalInKindContributionsCents}
                    empty="—"
                  />
                </div>
              </>
            ) : null}
          </section>

          <section className="members-panel fs-block">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <h2 className="members-panel__h" style={{ margin: 0 }}>
                Bilan au {formatFr(fs.asOf)}
              </h2>
              {bs.imbalanceCents === 0 ? (
                <span className="cf-pill cf-pill--ok">Équilibré</span>
              ) : (
                <span className="cf-pill cf-pill--warn">
                  Écart : {formatEuro(bs.imbalanceCents)}
                </span>
              )}
            </div>
            <div className="fs-columns" style={{ marginTop: 12 }}>
              <SectionsTable
                title="Actif"
                sections={bs.assets}
                totalLabel="Total de l’actif"
                totalCents={bs.totalAssetsCents}
                empty="Aucun actif."
              />
              <SectionsTable
                title="Passif"
                sections={bs.liabilities}
                totalLabel="Total du passif"
                totalCents={bs.totalLiabilitiesCents}
                empty="Aucun passif."
              />
            </div>
          </section>

          <p className="cf-muted fs-footnote">
            États provisoires, non audités, calculés le {formatFr(todayIso())} sur les
            écritures validées. Ni régularisations (charges et produits constatés
            d’avance), ni amortissements, ni écritures en attente de validation.
          </p>
        </>
      ) : null}
    </>
  );
}
