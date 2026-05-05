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
import { DocumentsToSignBanner } from '../components/DocumentsToSignBanner';
import { InviteFamilyMemberCta } from '../components/InviteFamilyMemberCta';
import { JoinFamilyByPayerEmailCta } from '../components/JoinFamilyByPayerEmailCta';
import { MemberRoleToggle } from '../components/MemberRoleToggle';
import { PromoteSelfToMemberCta } from '../components/PromoteSelfToMemberCta';
import { RegisterChildMemberCta } from '../components/RegisterChildMemberCta';
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
  const openInvoices =
    billing?.invoices.filter((i) => i.balanceCents > 0) ?? [];

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

  // KPIs payeur (Reste à payer / Déjà réglé) — parité mobile.
  const totalBalance = openInvoices.reduce((s, i) => s + i.balanceCents, 0);
  const totalPaid =
    billing?.invoices.reduce((s, i) => s + i.totalPaidCents, 0) ?? 0;

  return (
    <div className="mp-page">
      <DocumentsToSignBanner />
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
              ? `Content de te revoir, ${me.firstName}`
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

      {/* Bannière panier en cours (cliquable vers /adhesion) — visible
          dès que le payeur a ≥1 item dans son cart actif. Parité mobile. */}
      {cartIsOpen ? (
        <Link to="/adhesion" className="mp-cart-banner">
          <span
            className="material-symbols-outlined mp-cart-banner__ico"
            aria-hidden="true"
          >
            shopping_basket
          </span>
          <div className="mp-cart-banner__body">
            <strong>Panier d&rsquo;adhésion ({cartItemsCount})</strong>
            <small>
              Total {formatEuroCents(cart?.totalCents ?? 0)} —{' '}
              {cart?.canValidate ? 'prêt à valider' : 'à compléter'}
            </small>
          </div>
          <span className="mp-pill mp-pill-primary">Voir</span>
        </Link>
      ) : null}

      {/* KPIs payeur (Reste à payer / Déjà réglé) — cliquables vers
          /famille. Affichés uniquement si l'utilisateur est PAYER. */}
      {isPayer ? (
        <div className="mp-kpi-row">
          <Link
            to="/famille"
            className={`mp-kpi-tile${totalBalance > 0 ? ' mp-kpi-tile--warm' : ''}`}
          >
            <span
              className="material-symbols-outlined mp-kpi-tile__ico"
              aria-hidden="true"
            >
              account_balance_wallet
            </span>
            <span className="mp-kpi-tile__label">Reste à payer</span>
            <span className="mp-kpi-tile__value">
              {billQ.loading && !billing
                ? '…'
                : formatEuroCents(totalBalance)}
            </span>
          </Link>
          <Link to="/famille" className="mp-kpi-tile mp-kpi-tile--cool">
            <span
              className="material-symbols-outlined mp-kpi-tile__ico"
              aria-hidden="true"
            >
              check_circle
            </span>
            <span className="mp-kpi-tile__label">Déjà réglé</span>
            <span className="mp-kpi-tile__value">
              {billQ.loading && !billing
                ? '…'
                : formatEuroCents(totalPaid)}
            </span>
          </Link>
        </div>
      ) : null}

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

        {isPayer ? (
          <section className="mp-panel mp-panel-wide">
            <h2 className="mp-panel-title">Famille &amp; paiements</h2>
            {billQ.error ? (
              <p className="mp-hint">
                Facturation indisponible (module ou droits).
              </p>
            ) : !billing ? (
              <p className="mp-hint">Chargement…</p>
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
        ) : null}
      </div>
    </div>
  );
}
