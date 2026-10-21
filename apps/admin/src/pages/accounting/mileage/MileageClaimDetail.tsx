import type { MileageClaim, MileageClaimSummary, MileageTrip } from '../../../lib/mileage-documents';
import { formatEuro, formatFr } from '../reconciliation/format';
import {
  SETTLEMENT_LABEL,
  STATUS_LABEL,
  STATUS_PILL,
  formatDateTimeFr,
  formatKm,
} from './mileage-format';

/** Avertissement : barème de l'année pas encore publié. */
export function ProvisionalNotice() {
  return (
    <div className="cf-alert cf-alert--warning" style={{ margin: '8px 0' }}>
      <span className="material-symbols-outlined" aria-hidden>
        info
      </span>
      <div className="cf-alert__content">
        <strong>Montant provisoire</strong>
        <span>
          Le barème kilométrique URSSAF de cette année n’est pas encore publié :
          le montant est estimé sur le dernier barème connu.
        </span>
      </div>
    </div>
  );
}

/** Où en est le règlement d'une note validée. */
export function SettlementState({ claim }: { claim: MileageClaimSummary }) {
  if (claim.status !== 'APPROVED') return null;
  if (claim.settlement === 'DONATION') {
    return claim.taxReceiptNumber ? (
      <span className="cf-pill cf-pill--ok">Reçu n° {claim.taxReceiptNumber}</span>
    ) : (
      <span className="cf-pill cf-pill--info">Reçu fiscal à émettre</span>
    );
  }
  return claim.reimbursed ? (
    <span className="cf-pill cf-pill--ok">Remboursée</span>
  ) : (
    <span className="cf-pill cf-pill--warn">À rembourser</span>
  );
}

/**
 * Détail d'une note : en-tête, commentaires et déplacements. `onDeleteTrip`
 * n'est fourni que si la note est encore modifiable.
 */
export function MileageClaimDetail({
  claim,
  onDeleteTrip,
}: {
  claim: MileageClaim;
  onDeleteTrip?: (trip: MileageTrip) => void;
}) {
  return (
    <div className="cf-form">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className={STATUS_PILL[claim.status]}>{STATUS_LABEL[claim.status]}</span>
        <span className="cf-pill cf-pill--muted">{SETTLEMENT_LABEL[claim.settlement]}</span>
        <SettlementState claim={claim} />
      </div>
      <table className="cf-meta-table">
        <tbody>
          <tr>
            <th>Bénévole</th>
            <td>{claim.memberName}</td>
          </tr>
          <tr>
            <th>Période</th>
            <td>
              {claim.firstTripDate
                ? `${formatFr(claim.firstTripDate)} → ${formatFr(claim.lastTripDate)}`
                : '—'}
            </td>
          </tr>
          <tr>
            <th>Soumise le</th>
            <td>{formatDateTimeFr(claim.submittedAt)}</td>
          </tr>
          {claim.reviewedAt ? (
            <tr>
              <th>Décision le</th>
              <td>{formatDateTimeFr(claim.reviewedAt)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {claim.memberNote ? (
        <div>
          <strong>Note du bénévole</strong>
          <p className="cf-muted" style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>
            {claim.memberNote}
          </p>
        </div>
      ) : null}
      {claim.reviewComment ? (
        <div>
          <strong>Commentaire du trésorier</strong>
          <p className="cf-muted" style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>
            {claim.reviewComment}
          </p>
        </div>
      ) : null}
      {claim.provisional ? <ProvisionalNotice /> : null}

      {claim.trips.length === 0 ? (
        <p className="cf-muted">Aucun déplacement dans cette note.</p>
      ) : (
        <table className="cf-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Trajet</th>
              <th style={{ textAlign: 'right' }}>Km</th>
              <th style={{ textAlign: 'right' }}>Montant</th>
              {onDeleteTrip ? <th style={{ width: 40 }} /> : null}
            </tr>
          </thead>
          <tbody>
            {claim.trips.map((t) => (
              <tr key={t.id}>
                <td>{formatFr(t.tripDate)}</td>
                <td>
                  {t.fromLabel} → {t.toLabel}
                  {t.roundTrip ? ' (A/R)' : ''}
                  <small className="cf-muted" style={{ display: 'block' }}>
                    {t.purpose} · {t.vehicleLabel}
                    {t.recurringTripId ? ' · récurrent' : ''}
                  </small>
                </td>
                <td style={{ textAlign: 'right' }}>{formatKm(t.totalMeters)}</td>
                <td style={{ textAlign: 'right' }}>
                  {formatEuro(t.amountCents)}
                  {t.scaleLabel ? (
                    <small className="cf-muted" style={{ display: 'block' }}>
                      {t.scaleLabel}
                    </small>
                  ) : null}
                </td>
                {onDeleteTrip ? (
                  <td>
                    <button
                      type="button"
                      className="btn-ghost btn-ghost--sm"
                      aria-label="Supprimer ce déplacement"
                      onClick={() => onDeleteTrip(t)}
                    >
                      ✕
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={2}>
                Total — {claim.tripCount} déplacement{claim.tripCount > 1 ? 's' : ''}
              </th>
              <th style={{ textAlign: 'right' }}>{formatKm(claim.totalMeters)}</th>
              <th style={{ textAlign: 'right' }}>
                {formatEuro(claim.amountCents)}
                {claim.estimated ? (
                  <small className="cf-muted" style={{ display: 'block', fontWeight: 400 }}>
                    estimation
                  </small>
                ) : null}
              </th>
              {onDeleteTrip ? <th /> : null}
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
