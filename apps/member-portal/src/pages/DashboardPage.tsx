import { useQuery } from '@apollo/client/react';
import { Link } from 'react-router-dom';
import {
  CLUB,
  VIEWER_ADMIN_SWITCH,
  VIEWER_FAMILY_BILLING,
  VIEWER_ME,
  VIEWER_UPCOMING_SLOTS,
} from '../lib/viewer-documents';
import type {
  ClubQueryData,
  ViewerAdminSwitchData,
  ViewerBillingData,
  ViewerMeData,
  ViewerUpcomingData,
  ViewerSlot,
} from '../lib/viewer-types';
import {
  formatEuroCents,
  formatRangeHours,
  medicalCertState,
  slotCalendarBits,
} from '../lib/format';
import { MemberRoleToggle } from '../components/MemberRoleToggle';

function SlotCard({ slot }: { slot: ViewerSlot }) {
  const { weekday, dayNum } = slotCalendarBits(slot.startsAt);
  const coach = [slot.coachFirstName, slot.coachLastName]
    .filter(Boolean)
    .join(' ');
  return (
    <article className="mp-card mp-slot-row">
      <div className="mp-slot-cal">
        <span className="mp-slot-dow">{weekday}</span>
        <span className="mp-slot-day">{dayNum}</span>
      </div>
      <div className="mp-slot-body">
        <h3 className="mp-slot-title">{slot.title}</h3>
        <p className="mp-slot-meta">
          {formatRangeHours(slot.startsAt, slot.endsAt)} · {slot.venueName}
          {coach ? ` · ${coach}` : ''}
        </p>
      </div>
    </article>
  );
}

export function DashboardPage() {
  const { data: adminSwitchData } = useQuery<ViewerAdminSwitchData>(
    VIEWER_ADMIN_SWITCH,
    { fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first' },
  );
  const { data: meData, loading: meLoading, error: meError } =
    useQuery<ViewerMeData>(VIEWER_ME, { errorPolicy: 'all' });
  const { data: clubData } = useQuery<ClubQueryData>(CLUB);

  const slotsQ = useQuery<ViewerUpcomingData>(VIEWER_UPCOMING_SLOTS, {
    errorPolicy: 'all',
  });
  const billQ = useQuery<ViewerBillingData>(VIEWER_FAMILY_BILLING, {
    errorPolicy: 'all',
  });

  const me = meData?.viewerMe;
  const adminSwitch = adminSwitchData?.viewerAdminSwitch;
  const clubName = clubData?.club?.name;
  const slots = slotsQ.data?.viewerUpcomingCourseSlots ?? [];
  const dashSlots = slots.slice(0, 3);
  const billing = billQ.data?.viewerFamilyBillingSummary;
  const isPayer = billing?.isPayerView ?? false;
  const openInvoices =
    billing?.invoices.filter((i) => i.balanceCents > 0) ?? [];

  const cert = medicalCertState(me?.medicalCertExpiresAt ?? null);

  return (
    <div className="mp-page">
      <section className="mp-hero">
        <div className="mp-hero-head">
          <p className="mp-eyebrow">
            {clubName ? clubName : 'Espace membre'}
          </p>
          {adminSwitch?.canAccessClubBackOffice ? (
            <MemberRoleToggle
              canAccessClubBackOffice
              adminWorkspaceClubId={adminSwitch.adminWorkspaceClubId}
              className="mp-role-toggle--hero"
            />
          ) : null}
        </div>
        <h1 className="mp-hero-title">
          {meLoading
            ? '…'
            : me
              ? `Content de te revoir, ${me.firstName}`
              : meError
                ? 'Espace membre'
                : '…'}
        </h1>
        <div className="mp-badges-row">
          <span
            className={`mp-pill${me?.gradeLevelLabel ? '' : ' mp-pill-muted'}`}
          >
            <span className="material-symbols-outlined mp-pill-ico">school</span>
            {me?.gradeLevelLabel ?? 'Grade non renseigné'}
          </span>
          <span
            className={`mp-pill${cert.ok ? ' mp-pill-ok' : ' mp-pill-warn'}`}
          >
            <span className="material-symbols-outlined mp-pill-ico">
              verified_user
            </span>
            {cert.label}
          </span>
        </div>
      </section>

      <div className="mp-dashboard-grid">
        <section className="mp-panel">
          <h2 className="mp-panel-title">Mon programme</h2>
          <div className="mp-empty-soft">
            <span className="material-symbols-outlined mp-empty-ico">
              auto_stories
            </span>
            <p>
              Les contenus pédagogiques par grade arrivent bientôt dans cette
              section.
            </p>
          </div>
          <button type="button" className="mp-btn mp-btn-outline" disabled>
            Réserver un cours (à venir)
          </button>
        </section>

        <section className="mp-panel">
          <div className="mp-panel-head">
            <h2 className="mp-panel-title">Prochains cours</h2>
            {slots.length > 3 ? (
              <Link to="/planning" className="mp-link">
                Voir tout
              </Link>
            ) : null}
          </div>
          {slotsQ.error ? (
            <p className="mp-hint">
              Planning indisponible (module ou droits).
            </p>
          ) : dashSlots.length === 0 ? (
            <p className="mp-hint">Aucun cours à venir pour l’instant.</p>
          ) : (
            <ul className="mp-slot-list">
              {dashSlots.map((s) => (
                <li key={s.id}>
                  <SlotCard slot={s} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mp-panel mp-panel-wide">
          <h2 className="mp-panel-title">Famille &amp; paiements</h2>
          {billQ.error ? (
            <p className="mp-hint">
              Facturation indisponible (module ou droits).
            </p>
          ) : !billing ? (
            <p className="mp-hint">Chargement…</p>
          ) : !isPayer ? (
            <p className="mp-hint">
              L’accès au détail des factures est réservé au payeur du foyer.
            </p>
          ) : (
            <>
              {billing.familyLabel ? (
                <p className="mp-family-label">{billing.familyLabel}</p>
              ) : null}
              {openInvoices.length === 0 ? (
                <p className="mp-hint">Aucun solde ouvert.</p>
              ) : (
                <ul className="mp-invoice-mini">
                  {openInvoices.slice(0, 3).map((inv) => (
                    <li key={inv.id} className="mp-invoice-line">
                      <span>{inv.label}</span>
                      <strong>
                        {formatEuroCents(inv.balanceCents)}
                      </strong>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/famille" className="mp-link">
                Ouvrir Ma famille
              </Link>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
