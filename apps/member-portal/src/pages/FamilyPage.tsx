import { useQuery } from '@apollo/client/react';
import { JoinFamilyByPayerEmailCta } from '../components/JoinFamilyByPayerEmailCta';
import { VIEWER_FAMILY_BILLING } from '../lib/viewer-documents';
import type { ViewerBillingData } from '../lib/viewer-types';
import { formatEuroCents } from '../lib/format';

/**
 * Recommandation UX #8 — Reformulation du texte de rattachement familial
 * Recommandation UX #10 — Ergonomie mobile des factures (cartes vs tableau)
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

export function FamilyPage() {
  const { data, loading, error } = useQuery<ViewerBillingData>(
    VIEWER_FAMILY_BILLING,
    { errorPolicy: 'all' },
  );

  const summary = data?.viewerFamilyBillingSummary;
  const shared = summary?.isHouseholdGroupSpace === true;
  const linked = summary?.linkedHouseholdFamilies ?? [];

  const pageTitle = shared ? 'Espace familial partagé' : 'Ma famille';

  return (
    <div className="mp-page">
      <h1 className="mp-page-title">{pageTitle}</h1>

      {shared ? (
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

      {error ? (
        <p className="mp-hint">
          Facturation indisponible (module ou droits).
        </p>
      ) : loading ? (
        <p className="mp-hint">Chargement…</p>
      ) : !summary ? (
        <p className="mp-hint">Aucune donnée foyer.</p>
      ) : !summary.isPayerView ? (
        <p className="mp-hint">
          Réservé aux comptes adultes du foyer (mineurs : pas d'accès
          facturation).
        </p>
      ) : (
        <>
          {shared && linked.length > 0 ? (
            <section className="mp-subsection mp-shared-section">
              <h2 className="mp-subtitle">Foyers liés</h2>
              <p className="mp-hint mp-shared-hint">
                Chaque carte représente un foyer. Seuls les membres que vous
                êtes autorisé à voir (vous et les enfants) apparaissent.
              </p>
              <div className="mp-linked-grid">
                {linked.map((hf) => (
                  <article key={hf.familyId} className="mp-linked-card">
                    <h3 className="mp-linked-card__title">
                      {hf.label?.trim() || 'Foyer sans nom'}
                    </h3>
                    {hf.members.length === 0 ? (
                      <p className="mp-hint mp-linked-card__empty">
                        Aucun membre de ce foyer n'est affiché pour votre
                        compte.
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
                ))}
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
            ) : (
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
                      {summary.invoices.map((inv) => (
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
                  {summary.invoices.map((inv) => (
                    <article
                      key={inv.id}
                      className={`mp-invoice-card ${statusClass(inv.status)}`}
                    >
                      <div className="mp-invoice-card__head">
                        <span className={`mp-invoice-status-badge mp-invoice-status-badge--${inv.status.toLowerCase()}`}>
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
            )}
          </section>
        </>
      )}
    </div>
  );
}
