import { useMutation, useQuery } from '@apollo/client/react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  SELECT_VIEWER_CONTACT_PROFILE,
  SELECT_VIEWER_PROFILE,
  VIEWER_PROFILES,
} from '../lib/documents';
import type {
  SelectContactProfileData,
  SelectProfileData,
  ViewerProfile,
  ViewerProfilesQueryData,
} from '../lib/auth-types';
import {
  clearAuth,
  clearClubId,
  getClubId,
  setMemberSession,
} from '../lib/storage';
import { VIEWER_ME } from '../lib/viewer-documents';
import type { ViewerMeData } from '../lib/viewer-types';
import { PendingFamilyInvitesBanner } from './PendingFamilyInvitesBanner';
import {
  VIEWER_ACTIVE_CART,
  type ViewerActiveCartData,
} from '../lib/cart-documents';

function linkClass({ isActive }: { isActive: boolean }): string {
  return `mp-sidebar-link${isActive ? ' mp-sidebar-link-active' : ''}`;
}

function profileRowKey(p: ViewerProfile): string {
  if (p.memberId) return `m:${p.memberId}`;
  if (p.contactId) return `c:${p.contactId}`;
  return '';
}

export function ContactLayout() {
  const navigate = useNavigate();
  const clubId = getClubId();

  const { data: profilesData } = useQuery<ViewerProfilesQueryData>(
    VIEWER_PROFILES,
    { fetchPolicy: 'cache-and-network' },
  );

  const { data: meData } = useQuery<ViewerMeData>(VIEWER_ME, {
    skip: !clubId,
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
  });
  const canManageMembershipCart =
    meData?.viewerMe?.canManageMembershipCart === true;

  // Compteur global "panier d'adhésion" affiché dans le topbar quand le
  // viewer (contact) peut gérer un panier (payeur du foyer). Synchro
  // immédiate via cache-and-network après ajout/suppression.
  const { data: activeCartData } = useQuery<ViewerActiveCartData>(
    VIEWER_ACTIVE_CART,
    {
      skip: !clubId || !canManageMembershipCart,
      fetchPolicy: 'cache-and-network',
      nextFetchPolicy: 'cache-first',
    },
  );
  const activeCart = activeCartData?.viewerActiveMembershipCart ?? null;
  const cartItemCount =
    activeCart && activeCart.status === 'OPEN'
      ? activeCart.items.length + (activeCart.pendingItems?.length ?? 0)
      : 0;

  const [selectProfile, { loading: switchingMember }] =
    useMutation<SelectProfileData>(SELECT_VIEWER_PROFILE);
  const [selectContactProfile, { loading: switchingContact }] =
    useMutation<SelectContactProfileData>(SELECT_VIEWER_CONTACT_PROFILE);
  const switching = switchingMember || switchingContact;

  const profiles = profilesData?.viewerProfiles ?? [];
  const showSwitcher = profiles.length > 1;

  async function switchToProfile(p: ViewerProfile) {
    if (!clubId || switching) return;
    const nextClubId = p.clubId;
    if (p.memberId) {
      const { data: sel } = await selectProfile({
        variables: { memberId: p.memberId },
      });
      const newTok = sel?.selectActiveViewerProfile?.accessToken;
      if (!newTok) return;
      setMemberSession(newTok, nextClubId);
    } else if (p.contactId) {
      const { data: sel } = await selectContactProfile({
        variables: { contactId: p.contactId },
      });
      const newTok = sel?.selectActiveViewerContactProfile?.accessToken;
      if (!newTok) return;
      setMemberSession(newTok, nextClubId);
    } else {
      return;
    }
    void navigate('/', { replace: true });
    window.location.reload();
  }

  function goChangeProfile() {
    clearClubId();
    void navigate('/select-profile', { replace: true });
  }

  function logout(): void {
    clearAuth();
    void navigate('/login', { replace: true });
  }

  return (
    <div className="mp-shell">
      <aside className="mp-sidebar" aria-label="Navigation contact">
        <div className="mp-sidebar-brand">
          <span className="mp-logo">ClubFlow</span>
        </div>
        <nav className="mp-sidebar-nav">
          <NavLink to="/" end className={linkClass}>
            <span className="mp-ico material-symbols-outlined">home</span>
            Accueil
          </NavLink>
          <NavLink to="/factures" className={linkClass}>
            <span className="mp-ico material-symbols-outlined">receipt_long</span>
            Mes factures
          </NavLink>
          <NavLink to="/famille" className={linkClass}>
            <span className="mp-ico material-symbols-outlined">groups</span>
            Famille
          </NavLink>
          {canManageMembershipCart ? (
            <NavLink to="/adhesion" className={linkClass}>
              <span className="mp-ico material-symbols-outlined">
                shopping_cart
              </span>
              Panier d&rsquo;adhésion
              {cartItemCount > 0 ? (
                <span
                  aria-hidden="true"
                  style={{
                    marginLeft: 'auto',
                    minWidth: 20,
                    padding: '0 6px',
                    borderRadius: 10,
                    background: '#dc2626',
                    color: 'white',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    lineHeight: '18px',
                    textAlign: 'center',
                  }}
                >
                  {cartItemCount}
                </span>
              ) : null}
            </NavLink>
          ) : null}
          <NavLink to="/actus" className={linkClass}>
            <span className="mp-ico material-symbols-outlined">campaign</span>
            Actus & sondages
          </NavLink>
          <NavLink to="/evenements" className={linkClass}>
            <span className="mp-ico material-symbols-outlined">event</span>
            Événements
          </NavLink>
          <NavLink to="/mes-projets" className={linkClass}>
            <span className="mp-ico material-symbols-outlined">rocket_launch</span>
            Mes projets
          </NavLink>
          <NavLink to="/parametres" className={linkClass}>
            <span className="mp-ico material-symbols-outlined">settings</span>
            Paramètres
          </NavLink>
        </nav>
        <button type="button" className="mp-cta-sidebar" onClick={logout}>
          Déconnexion
        </button>
      </aside>
      <div className="mp-main-wrap">
        <header className="mp-topbar">
          <div className="mp-breadcrumb">
            <span className="mp-bc-muted">Espace contact</span>
          </div>
          <div className="mp-topbar-actions">
            {showSwitcher ? (
              <div
                className="mp-profile-chips"
                role="group"
                aria-label="Changer de profil"
              >
                {profiles.map((p) => (
                  <button
                    key={profileRowKey(p)}
                    type="button"
                    className="mp-profile-chip"
                    title={`${p.firstName} ${p.lastName}`}
                    disabled={switching}
                    onClick={() => void switchToProfile(p)}
                  >
                    <span className="mp-chip-initials">
                      {p.firstName.slice(0, 1)}
                      {p.lastName.slice(0, 1)}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className="mp-profile-chip mp-profile-chip-more"
                  onClick={goChangeProfile}
                  title="Liste des profils"
                >
                  …
                </button>
              </div>
            ) : null}
            {canManageMembershipCart ? (
              <NavLink
                to="/adhesion"
                className="mp-icon-btn mp-cart-icon"
                aria-label={
                  cartItemCount > 0
                    ? `Panier d’adhésion (${cartItemCount} article${cartItemCount > 1 ? 's' : ''})`
                    : 'Panier d’adhésion (vide)'
                }
                title="Panier d’adhésion"
                style={{ position: 'relative' }}
              >
                <span className="material-symbols-outlined">
                  shopping_cart
                </span>
                {cartItemCount > 0 ? (
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      top: -2,
                      right: -2,
                      minWidth: 18,
                      height: 18,
                      padding: '0 4px',
                      borderRadius: 9,
                      background: '#dc2626',
                      color: 'white',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      lineHeight: '18px',
                      textAlign: 'center',
                      boxShadow: '0 0 0 2px white',
                    }}
                  >
                    {cartItemCount}
                  </span>
                ) : null}
              </NavLink>
            ) : null}
            <button
              type="button"
              className="mp-icon-btn"
              aria-label="Déconnexion"
              title="Déconnexion"
              onClick={logout}
            >
              <span className="material-symbols-outlined">logout</span>
            </button>
          </div>
        </header>
        <main className="mp-content">
          <PendingFamilyInvitesBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
