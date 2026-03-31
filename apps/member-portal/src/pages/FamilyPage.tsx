import { useQuery } from '@apollo/client/react';
import { VIEWER_FAMILY_BILLING } from '../lib/viewer-documents';
import type { ViewerBillingData } from '../lib/viewer-types';
import { formatEuroCents } from '../lib/format';

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

export function FamilyPage() {
  const { data, loading, error } = useQuery<ViewerBillingData>(
    VIEWER_FAMILY_BILLING,
    { errorPolicy: 'all' },
  );

  const summary = data?.viewerFamilyBillingSummary;

  return (
    <div className="mp-page">
      <h1 className="mp-page-title">Ma famille</h1>

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
          Réservé aux comptes adultes du foyer (mineurs : pas d’accès
          facturation).
        </p>
      ) : (
        <>
          {summary.familyLabel ? (
            <p className="mp-family-label mp-family-label-lg">
              {summary.familyLabel}
            </p>
          ) : null}

          {summary.familyMembers.length > 0 ? (
            <section className="mp-subsection">
              <h2 className="mp-subtitle">Membres</h2>
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
            <h2 className="mp-subtitle">Factures</h2>
            {summary.invoices.length === 0 ? (
              <p className="mp-hint">Aucune facture.</p>
            ) : (
              <div className="mp-table-wrap">
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
            )}
          </section>
        </>
      )}
    </div>
  );
}
