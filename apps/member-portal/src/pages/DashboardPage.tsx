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
  formatRangeHours,
  medicalCertState,
  slotCalendarBits,
} from '../lib/format';
import { InviteFamilyMemberCta } from '../components/InviteFamilyMemberCta';
import { JoinFamilyByPayerEmailCta } from '../components/JoinFamilyByPayerEmailCta';
import { MemberRoleToggle } from '../components/MemberRoleToggle';
import { PromoteSelfToMemberCta } from '../components/PromoteSelfToMemberCta';
import { RegisterChildMemberCta } from '../components/RegisterChildMemberCta';
import { StatusSummary } from '../components/StatusSummary';
import {
  VIEWER_ACTIVE_CART,
  type ViewerActiveCartData,
} from '../lib/cart-documents';

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

  const hideMemberModules = meData?.viewerMe?.hideMemberModules === true;

  const slotsQ = useQuery<ViewerUpcomingData>(VIEWER_UPCOMING_SLOTS, {
    skip: hideMemberModules,
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

  const cert = medicalCertState(me?.medicalCertExpiresAt ?? null);

  // Bannière panier d'adhésion + CTAs inscriptions famille — parité
  // mobile (cf. apps/mobile/src/screens/HomeDashboardScreen.tsx).
  const canManageMembershipCart =
    meData?.viewerMe?.canManageMembershipCart === true;
  const hasClubFamily = meData?.viewerMe?.hasClubFamily === true;
  const isContactProfile = meData?.viewerMe?.isContactProfile === true;
  const cartQ = useQuery<ViewerActiveCartData>(VIEWER_ACTIVE_CART, {
    skip: !canManageMembershipCart,
    fetchPolicy: 'cache-and-network',
  });
  const cart = cartQ.data?.viewerActiveMembershipCart ?? null;
  const cartItemsCount =
    (cart?.items.length ?? 0) + (cart?.pendingItems.length ?? 0);
  const cartIsOpen = cart?.status === 'OPEN' && cartItemsCount > 0;

  return (
    <div className="mp-page">
      <section className="mp-hero">
        <div className="mp-hero-head">
          <p className="mp-eyebrow">
            {clubName ? clubName : 'Espace membre'}
          </p>
          {adminSwitch?.canAccessClubBackOffice === true ? (
            <MemberRoleToggle
              canAccessClubBackOffice={true}
              adminWorkspaceClubId={adminSwitch.adminWorkspaceClubId}
              className="mp-role-toggle--hero"
            />
          ) : null}
        </div>
        <h1 className="mp-hero-title">
          {meLoading
            ? '…'
            : me
              ? `Bonjour, ${me.firstName}`
              : meError
                ? 'Espace membre'
                : '…'}
        </h1>
        <div className="mp-badges-row">
          {!hideMemberModules ? (
            <>
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
              {me?.telegramLinked ? (
                <span className="mp-pill mp-pill-ok">
                  <span className="material-symbols-outlined mp-pill-ico">
                    send
                  </span>
                  Telegram relié
                </span>
              ) : (
                <span className="mp-pill mp-pill-muted">
                  <span className="material-symbols-outlined mp-pill-ico">
                    send
                  </span>
                  Telegram non relié
                </span>
              )}
            </>
          ) : null}
          {billing?.isHouseholdGroupSpace && isPayer ? (
            <Link
              to="/famille"
              className="mp-pill mp-pill-muted mp-pill-link"
            >
              <span className="material-symbols-outlined mp-pill-ico">
                groups
              </span>
              Espace familial partagé
            </Link>
          ) : null}
        </div>
      </section>

      <JoinFamilyByPayerEmailCta variant="dashboard" />

      {/* Résumé « Où j'en suis » : paiements (reste dû, échéanciers, panier),
          documents à signer et certificat, informations à compléter. Il
          remplace la bannière panier, les indicateurs payeur, la bannière des
          documents et le panneau « Famille & paiements », qui disaient chacun
          un morceau de la même chose. */}
      <StatusSummary
        me={me}
        billing={billing}
        billingLoading={billQ.loading && !billing}
        cart={
          cartIsOpen
            ? {
                itemsCount: cartItemsCount,
                totalCents: cart?.totalCents ?? 0,
                canValidate: cart?.canValidate === true,
              }
            : null
        }
        cartId={cartIsOpen ? (cart?.id ?? null) : null}
        requiresMedicalCertificate={
          clubData?.club?.requiresMedicalCertificate === true
        }
      />

      {/* Inscriptions famille (PAYER uniquement) — modales déjà présentes
          dans les composants existants : RegisterChild + PromoteSelf
          + InviteFamily. Parité avec l'app mobile. */}
      {canManageMembershipCart ? (
        <section className="mp-panel">
          <h2 className="mp-panel-title">Inscriptions famille</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <RegisterChildMemberCta />
            {/* PromoteSelf : visible uniquement si l'utilisateur n'est
                pas encore Member sur ce club (sinon = doublon
                d'inscription). isContactProfile true ⇒ pur Contact. */}
            {isContactProfile ? <PromoteSelfToMemberCta /> : null}
            {hasClubFamily ? <InviteFamilyMemberCta /> : null}
          </div>
        </section>
      ) : null}

      <div
        className={`mp-dashboard-grid${hideMemberModules ? ' mp-dashboard-grid--billing-only' : ''}`}
      >
        {!hideMemberModules ? (
          <>
            <section className="mp-panel">
              <h2 className="mp-panel-title">Mon programme</h2>
              {me?.gradeLevelLabel ? (
                <div className="mp-program-summary">
                  <div className="mp-program-grade">
                    <span className="material-symbols-outlined mp-program-ico">school</span>
                    <div>
                      <strong>{me.gradeLevelLabel}</strong>
                      <p className="mp-hint">Votre grade actuel</p>
                    </div>
                  </div>
                  <Link to="/progression" className="mp-link" style={{ marginTop: '0.5rem', display: 'inline-block' }}>
                    Voir ma progression complète
                  </Link>
                </div>
              ) : (
                <div className="mp-empty-soft">
                  <span className="material-symbols-outlined mp-empty-ico">
                    auto_stories
                  </span>
                  <p>
                    Votre grade n'est pas encore renseigné. Les contenus
                    pédagogiques par grade seront disponibles ici.
                  </p>
                </div>
              )}
              <Link to="/planning" className="mp-btn mp-btn-outline" style={{ textDecoration: 'none', textAlign: 'center', display: 'block' }}>
                Consulter le planning
              </Link>
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
          </>
        ) : null}
      </div>
    </div>
  );
}
