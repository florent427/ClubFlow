import { useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { InviteFamilyMemberCta } from '../components/InviteFamilyMemberCta';
import { JoinFamilyByPayerEmailCta } from '../components/JoinFamilyByPayerEmailCta';
import { VIEWER_ALL_FAMILY_BILLING } from '../lib/viewer-documents';
import type {
  ViewerAllBillingData,
  ViewerFamilyBillingSummary,
} from '../lib/viewer-types';
import { formatEuroCents } from '../lib/format';

/**
 * Recommandation UX #8 — Reformulation du texte de rattachement familial
 * Recommandation UX #10 — Ergonomie mobile des factures (cartes vs tableau)
 *
 * Multi-foyer : un même contact peut être rattaché à plusieurs foyers distincts
 * (grand-parent payeur dans 2 foyers, assistant coach, etc.). Quand > 1 foyer :
 * onglets en haut pour basculer entre chaque foyer ; la section foyer sélectionné
 * affiche la même vue qu'un mono-foyer.
 */

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

function statusClass(status: string): string {
  switch (status) {
    case 'OPEN':
      return 'mp-invoice-card--open';
    case 'PAID':
      return 'mp-invoice-card--paid';
    case 'DRAFT':
      return 'mp-invoice-card--draft';
    case 'VOID':
      return 'mp-invoice-card--void';
    default:
      return '';
  }
}

function summaryKey(s: ViewerFamilyBillingSummary): string {
  return s.householdGroupId ?? s.familyId ?? 'unknown';
}

function membersFallbackLabel(
  members: Array<{ lastName: string }>,
): string | null {
  const names = [
    ...new Set(
      members
        .map((m) => (m.lastName ?? '').trim())
        .filter((s) => s.length > 0),
    ),
  ].sort();
  if (names.length === 0) return null;
  return `Famille ${names.join('-')}`;
}

function summaryTitle(
  s: ViewerFamilyBillingSummary,
  fallbackIndex: number,
): string {
  if (s.familyLabel?.trim()) return s.familyLabel.trim();
  const derived = membersFallbackLabel(s.familyMembers);
  if (derived) return derived;
  if (s.isHouseholdGroupSpace) return `Espace partagé ${fallbackIndex}`;
  return `Foyer ${fallbackIndex}`;
}

export function FamilyPage() {
  const { data, loading, error } = useQuery<ViewerAllBillingData>(
    VIEWER_ALL_FAMILY_BILLING,
    { errorPolicy: 'all' },
  );

  const summaries = useMemo(
    () => data?.viewerAllFamilyBillingSummaries ?? [],
    [data?.viewerAllFamilyBillingSummaries],
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const activeSummary = useMemo<ViewerFamilyBillingSummary | null>(() => {
    if (summaries.length === 0) return null;
    if (selectedKey) {
      const found = summaries.find((s) => summaryKey(s) === selectedKey);
      if (found) return found;
    }
    return summaries[0] ?? null;
  }, [summaries, selectedKey]);

  const multiFamily = summaries.length > 1;
  const anyPayerView = summaries.some((s) => s.isPayerView);
  const shared = activeSummary?.isHouseholdGroupSpace === true;

  const pageTitle = multiFamily
    ? 'Mes foyers'
    : shared
      ? 'Espace familial partagé'
      : 'Ma famille';

  return (
    <div className="mp-page">
      <h1 className="mp-page-title">{pageTitle}</h1>

      {multiFamily ? (
        <p className="mp-lead mp-lead--tight">
          Vous êtes rattaché(e) à <strong>{summaries.length} foyers</strong>.
          Sélectionnez un foyer pour afficher ses membres et ses factures.
        </p>
      ) : shared ? (
        <p className="mp-lead">
          Votre club a relié plusieurs foyers dans un{' '}
          <strong>espace partagé</strong>. Vous partagez les{' '}
          <strong>mêmes factures</strong> et voyez les{' '}
          <strong>mêmes enfants</strong>, mais chaque parent garde son{' '}
          <strong>espace personnel privé</strong>.
        </p>
      ) : (
        <p className="mp-lead mp-lead--tight">
          Membres du foyer et factures visibles par les adultes responsables
          de la facturation.
        </p>
      )}

      <JoinFamilyByPayerEmailCta variant="compact" />

      {anyPayerView ? (
        <div className="mp-family-actions">
          <InviteFamilyMemberCta />
        </div>
      ) : null}

      {multiFamily ? (
        <div className="mp-family-tabs" role="tablist" aria-label="Choisir un foyer">
          {summaries.map((s, i) => {
            const key = summaryKey(s);
            const isActive = activeSummary
              ? summaryKey(activeSummary) === key
              : false;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`mp-family-tab${isActive ? ' mp-family-tab--active' : ''}`}
                onClick={() => setSelectedKey(key)}
                title={summaryTitle(s, i + 1)}
              >
                <span className="material-symbols-outlined mp-family-tab__ico">
                  {s.isHouseholdGroupSpace ? 'groups_2' : 'groups'}
                </span>
                <span className="mp-family-tab__label">
                  {summaryTitle(s, i + 1)}
                </span>
                {s.invoices.some((inv) => inv.status === 'OPEN') ? (
                  <span className="mp-family-tab__badge" aria-label="Factures à payer">
                    •
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {error ? (
        <p className="mp-hint">
          Facturation indisponible (module ou droits).
        </p>
      ) : loading ? (
        <p className="mp-hint">Chargement…</p>
      ) : !activeSummary ? (
        <p className="mp-hint">Aucun foyer rattaché à votre profil.</p>
      ) : !activeSummary.isPayerView ? (
        <p className="mp-hint">
          Réservé aux comptes adultes du foyer (mineurs : pas d'accès
          facturation).
        </p>
      ) : (
        <FamilySummaryBody summary={activeSummary} />
      )}
    </div>
  );
}

function FamilySummaryBody({
  summary,
}: {
  summary: ViewerFamilyBillingSummary;
}) {
  const shared = summary.isHouseholdGroupSpace;
  const linked = summary.linkedHouseholdFamilies;

  return (
    <>
      {shared && linked.length > 0 ? (
        <section className="mp-subsection mp-shared-section">
          <h2 className="mp-subtitle">Foyers liés</h2>
          <p className="mp-hint mp-shared-hint">
            Chaque carte représente un foyer auquel vous avez accès (le vôtre
            ou un foyer qui vous a invité·e).
          </p>
          <div className="mp-linked-grid">
            {linked.map((hf) => {
              const linkedLabel =
                hf.label?.trim() ||
                membersFallbackLabel(hf.members) ||
                'Membres du foyer';
              return (
                <article key={hf.familyId} className="mp-linked-card">
                  <h3 className="mp-linked-card__title">{linkedLabel}</h3>

                  {(() => {
                    const coPayers = hf.observers.filter(
                      (o) => o.role === 'COPAYER',
                    );
                    const viewers = hf.observers.filter(
                      (o) => o.role === 'VIEWER',
                    );
                    const fmt = (
                      list: Array<{ firstName: string; lastName: string }>,
                    ) =>
                      list
                        .map((p) => `${p.firstName} ${p.lastName}`.trim())
                        .filter(Boolean)
                        .join(', ') || '—';
                    return (
                      <>
                        {hf.payers.length > 0 ? (
                          <div className="mp-linked-card__role">
                            <span className="mp-linked-card__role-label">
                              Payeur{hf.payers.length > 1 ? 's' : ''} :
                            </span>
                            <span className="mp-linked-card__role-names">
                              {fmt(hf.payers)}
                            </span>
                          </div>
                        ) : null}
                        {coPayers.length > 0 ? (
                          <div className="mp-linked-card__role">
                            <span className="mp-linked-card__role-label">
                              Co-payeur{coPayers.length > 1 ? 's' : ''} :
                            </span>
                            <span className="mp-linked-card__role-names">
                              {fmt(coPayers)}
                            </span>
                          </div>
                        ) : null}
                        {viewers.length > 0 ? (
                          <div className="mp-linked-card__role">
                            <span className="mp-linked-card__role-label">
                              Observateur{viewers.length > 1 ? 's' : ''} :
                            </span>
                            <span className="mp-linked-card__role-names">
                              {fmt(viewers)}
                            </span>
                          </div>
                        ) : null}
                      </>
                    );
                  })()}

                  {hf.members.length === 0 ? (
                    <p className="mp-hint mp-linked-card__empty">
                      Aucun enfant rattaché à ce foyer pour le moment.
                    </p>
                  ) : (
                    <ul className="mp-member-chips mp-member-chips--compact">
                      {hf.members.map((m) => (
                        <li key={m.memberId} className="mp-member-chip">
                          {m.photoUrl ? (
                            <img src={m.photoUrl} alt="" className="mp-mi" />
                          ) : (
                            <span className="mp-mi mp-mi-ph">
                              {m.firstName[0]}
                              {m.lastName[0]}
                            </span>
                          )}
                          <span>
                            {m.firstName} {m.lastName}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {shared ? (
        <section className="mp-subsection">
          <h2 className="mp-subtitle">Documents &amp; messages</h2>
          <div className="mp-shared-roadmap">
            <div className="mp-shared-roadmap__item">
              <span className="material-symbols-outlined mp-shared-roadmap__ico">
                folder_shared
              </span>
              <div>
                <strong>Documents partagés</strong>
                <p className="mp-hint">
                  Reçus et fichiers partagés selon les mêmes règles que
                  ci-dessus (vous et les enfants) —{' '}
                  <em>arrive prochainement</em>.
                </p>
              </div>
            </div>
            <div className="mp-shared-roadmap__item">
              <span className="material-symbols-outlined mp-shared-roadmap__ico">
                forum
              </span>
              <div>
                <strong>Messages familiaux</strong>
                <p className="mp-hint">
                  Échanges privés entre membres de votre espace partagé —{' '}
                  <em>en conception</em>.
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {!shared && summary.familyLabel ? (
        <p className="mp-family-label mp-family-label-lg">
          {summary.familyLabel}
        </p>
      ) : null}

      {summary.familyMembers.length > 0 ? (
        <section className="mp-subsection">
          <h2 className="mp-subtitle">
            {shared ? 'Tous les membres de l\u2019espace' : 'Membres'}
          </h2>
          <ul className="mp-member-chips">
            {summary.familyMembers.map((m) => (
              <li key={m.memberId} className="mp-member-chip">
                {m.photoUrl ? (
                  <img src={m.photoUrl} alt="" className="mp-mi" />
                ) : (
                  <span className="mp-mi mp-mi-ph">
                    {m.firstName[0]}
                    {m.lastName[0]}
                  </span>
                )}
                <span>
                  {m.firstName} {m.lastName}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mp-subsection">
        <h2 className="mp-subtitle">
          {shared ? 'Paiements & factures (espace partagé)' : 'Factures'}
        </h2>
        {summary.invoices.length === 0 ? (
          <p className="mp-hint">Aucune facture.</p>
        ) : shared ? (
          <InvoicesByFamily
            invoices={summary.invoices}
            linkedHouseholdFamilies={summary.linkedHouseholdFamilies}
          />
        ) : (
          <InvoicesTableAndCards invoices={summary.invoices} />
        )}
      </section>
    </>
  );
}

function InvoicesByFamily({
  invoices,
  linkedHouseholdFamilies,
}: {
  invoices: ViewerFamilyBillingSummary['invoices'];
  linkedHouseholdFamilies: ViewerFamilyBillingSummary['linkedHouseholdFamilies'];
}) {
  // On regroupe par foyer responsable (`familyId`) pour que chaque payeur
  // voie clairement sa part. Les factures sans famille (rares : bugs de
  // données) sont remontées dans un bucket "Non rattaché".
  const groups = new Map<
    string,
    {
      familyId: string | null;
      label: string;
      invoices: ViewerFamilyBillingSummary['invoices'];
    }
  >();

  const labelFor = (familyId: string | null): string => {
    if (!familyId) return 'Non rattaché';
    const linked = linkedHouseholdFamilies.find((f) => f.familyId === familyId);
    if (linked?.label?.trim()) return linked.label.trim();
    if (linked)
      return membersFallbackLabel(linked.members) ?? 'Membres du foyer';
    return 'Autre foyer';
  };

  for (const inv of invoices) {
    const key = inv.familyId ?? '__unlinked__';
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = {
        familyId: inv.familyId ?? null,
        label: inv.familyLabel?.trim() || labelFor(inv.familyId ?? null),
        invoices: [],
      };
      groups.set(key, bucket);
    }
    bucket.invoices.push(inv);
  }

  const orderedGroups = [...groups.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'fr'),
  );

  return (
    <div className="mp-invoices-by-family">
      {orderedGroups.map((g) => (
        <div
          key={g.familyId ?? '__unlinked__'}
          className="mp-invoices-by-family__group"
        >
          <h3 className="mp-invoices-by-family__title">
            <span className="material-symbols-outlined mp-invoices-by-family__ico">
              groups
            </span>
            {g.label}
            <span className="mp-invoices-by-family__count">
              {g.invoices.length} facture{g.invoices.length > 1 ? 's' : ''}
            </span>
          </h3>
          <InvoicesTableAndCards invoices={g.invoices} />
        </div>
      ))}
    </div>
  );
}

function InvoicesTableAndCards({
  invoices,
}: {
  invoices: ViewerFamilyBillingSummary['invoices'];
}) {
  return (
    <>
      {/* Desktop : tableau classique */}
      <div className="mp-table-wrap mp-invoices-desktop">
        <table className="mp-table">
          <thead>
            <tr>
              <th>Libellé</th>
              <th>Statut</th>
              <th className="mp-num">Montant</th>
              <th className="mp-num">Payé</th>
              <th className="mp-num">Solde</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>
                  <div>{inv.label}</div>
                  {inv.payments?.length ? (
                    <ul className="mp-hint mp-invoice-payments">
                      {inv.payments.map((p) => (
                        <li key={p.id}>
                          {formatEuroCents(p.amountCents)} —{' '}
                          {p.paidByFirstName || p.paidByLastName
                            ? `${p.paidByFirstName ?? ''} ${p.paidByLastName ?? ''}`.trim()
                            : 'Club'}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </td>
                <td>{statusLabel(inv.status)}</td>
                <td className="mp-num">
                  {formatEuroCents(inv.amountCents)}
                </td>
                <td className="mp-num">
                  {formatEuroCents(inv.totalPaidCents)}
                </td>
                <td className="mp-num">
                  {formatEuroCents(inv.balanceCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile : cartes factures */}
      <div className="mp-invoices-mobile">
        {invoices.map((inv) => (
          <article
            key={inv.id}
            className={`mp-invoice-card ${statusClass(inv.status)}`}
          >
            <div className="mp-invoice-card__head">
              <span
                className={`mp-invoice-status-badge mp-invoice-status-badge--${inv.status.toLowerCase()}`}
              >
                {statusLabel(inv.status)}
              </span>
              <span className="mp-invoice-card__amount">
                {formatEuroCents(inv.amountCents)}
              </span>
            </div>
            <p className="mp-invoice-card__label">{inv.label}</p>
            <div className="mp-invoice-card__details">
              <span>Payé : {formatEuroCents(inv.totalPaidCents)}</span>
              <span className="mp-invoice-card__balance">
                Solde : {formatEuroCents(inv.balanceCents)}
              </span>
            </div>
            {inv.payments?.length ? (
              <ul className="mp-invoice-card__payments">
                {inv.payments.map((p) => (
                  <li key={p.id}>
                    {formatEuroCents(p.amountCents)} —{' '}
                    {p.paidByFirstName || p.paidByLastName
                      ? `${p.paidByFirstName ?? ''} ${p.paidByLastName ?? ''}`.trim()
                      : 'Club'}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </>
  );
}
