import { useMutation, useQuery } from '@apollo/client/react';
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
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
import { MemberRoleToggle } from './MemberRoleToggle';
import { clearAuth, clearClubId, getClubId, setMemberSession } from '../lib/storage';
import { VIEWER_ADMIN_SWITCH, VIEWER_ME } from '../lib/viewer-documents';
import type { ViewerAdminSwitchData, ViewerMeData } from '../lib/viewer-types';
import { PendingFamilyInvitesBanner } from './PendingFamilyInvitesBanner';
import {
  VIEWER_ACTIVE_CART,
  type ViewerActiveCartData,
} from '../lib/cart-documents';

function profileRowKey(p: ViewerProfile): string {
  if (p.memberId) return `m:${p.memberId}`;
  if (p.contactId) return `c:${p.contactId}`;
  return '';
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `mp-sidebar-link${isActive ? ' mp-sidebar-link-active' : ''}`;

const bottomClass = ({ isActive }: { isActive: boolean }) =>
  `mp-bottom-btn${isActive ? ' mp-bottom-btn-active' : ''}`;

function breadcrumbLabel(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'Tableau de bord';
  if (pathname.startsWith('/progression')) return 'Ma progression';
  if (pathname.startsWith('/planning')) return 'Planning';
  if (pathname.startsWith('/famille')) return 'Famille & espace partagé';
  if (pathname.startsWith('/adhesion')) return 'Panier d\u2019adhésion';
  if (pathname.startsWith('/parametres')) return 'Paramètres';
  if (pathname.startsWith('/messagerie')) return 'Messagerie';
  if (pathname.startsWith('/actus')) return 'Vie du club';
  if (pathname.startsWith('/evenements')) return 'Événements';
  if (pathname.startsWith('/blog')) return 'Blog du club';
  if (pathname.startsWith('/boutique')) return 'Boutique';
  if (pathname.startsWith('/reservations')) return 'Réservations';
  return 'Espace membre';
}

export function MemberLayout() {
  const loc = useLocation();
  const navigate = useNavigate();
  const clubId = getClubId();

  const { data: profilesData } = useQuery<ViewerProfilesQueryData>(
    VIEWER_PROFILES,
    { fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first' },
  );

  const { data: meData } = useQuery<ViewerMeData>(VIEWER_ME, {
    skip: !clubId,
    fetchPolicy: 'cache-first',
  });

  // Compteur global "panier d'adhésion" affiché en topbar quand le viewer
  // peut gérer un panier (payeur du foyer). On utilise cache-and-network
  // pour rester à jour après ajout/suppression d'un membre depuis
  // n'importe quelle page.
  const canManageCart = meData?.viewerMe?.canManageMembershipCart === true;
  const { data: activeCartData } = useQuery<ViewerActiveCartData>(
    VIEWER_ACTIVE_CART,
    {
      skip: !clubId || !canManageCart,
      fetchPolicy: 'cache-and-network',
      nextFetchPolicy: 'cache-first',
    },
  );
  const activeCart = activeCartData?.viewerActiveMembershipCart ?? null;
  const cartItemCount =
    activeCart && activeCart.status === 'OPEN'
      ? activeCart.items.length + (activeCart.pendingItems?.length ?? 0)
      : 0;

  const { data: adminSwitchData } = useQuery<ViewerAdminSwitchData>(
    VIEWER_ADMIN_SWITCH,
    {
      fetchPolicy: 'cache-and-network',
      nextFetchPolicy: 'cache-first',
    },
  );

  const [selectProfile, { loading: switchingMember }] =
    useMutation<SelectProfileData>(SELECT_VIEWER_PROFILE);
  const [selectContactProfile, { loading: switchingContact }] =
    useMutation<SelectContactProfileData>(SELECT_VIEWER_CONTACT_PROFILE);

  const switching = switchingMember || switchingContact;

  const profiles = profilesData?.viewerProfiles ?? [];
  const showSwitcher = profiles.length > 1;
  const hideMemberModules = meData?.viewerMe?.hideMemberModules === true;
  const canManageMembershipCart =
    meData?.viewerMe?.canManageMembershipCart === true;
  const adminSwitch = adminSwitchData?.viewerAdminSwitch;
  const canAccessClubBackOffice: boolean =
    adminSwitch?.canAccessClubBackOffice === true;
  const adminWorkspaceClubId = adminSwitch?.adminWorkspaceClubId ?? null;

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

  const crumb = breadcrumbLabel(loc.pathname);

  return (
    <div className="mp-shell">
      <aside className="mp-sidebar" aria-label="Navigation principale">
        <div className="mp-sidebar-brand">
          <span className="mp-logo">ClubFlow</span>
        </div>
        <nav className="mp-sidebar-nav">
          <NavLink to="/" end className={navClass}>
            <span className="mp-ico material-symbols-outlined">dashboard</span>
            Tableau de bord
          </NavLink>
          {!hideMemberModules ? (
            <>
              <NavLink to="/progression" className={navClass}>
                <span className="mp-ico material-symbols-outlined">school</span>
                Ma progression
              </NavLink>
              <NavLink to="/planning" className={navClass}>
                <span className="mp-ico material-symbols-outlined">calendar_today</span>
                Planning
              </NavLink>
            </>
          ) : null}
          <NavLink to="/famille" className={navClass}>
            <span className="mp-ico material-symbols-outlined">groups</span>
            Famille &amp; partage
          </NavLink>
          {canManageMembershipCart ? (
            <NavLink to="/adhesion" className={navClass}>
              <span className="mp-ico material-symbols-outlined">loyalty</span>
              Projet d&rsquo;adhésion
            </NavLink>
          ) : null}
          <NavLink to="/factures" className={navClass}>
            <span className="mp-ico material-symbols-outlined">receipt_long</span>
            Factures
          </NavLink>
          <NavLink to="/actus" className={navClass}>
            <span className="mp-ico material-symbols-outlined">campaign</span>
            Vie du club
          </NavLink>
          <NavLink to="/evenements" className={navClass}>
            <span className="mp-ico material-symbols-outlined">event</span>
            Événements
          </NavLink>
          <NavLink to="/mes-projets" className={navClass}>
            <span className="mp-ico material-symbols-outlined">rocket_launch</span>
            Mes projets
          </NavLink>
          <NavLink to="/reservations" className={navClass}>
            <span className="mp-ico material-symbols-outlined">event_available</span>
            Réservations
          </NavLink>
          <NavLink to="/blog" className={navClass}>
            <span className="mp-ico material-symbols-outlined">article</span>
            Blog
          </NavLink>
          <NavLink to="/boutique" className={navClass}>
            <span className="mp-ico material-symbols-outlined">storefront</span>
            Boutique
          </NavLink>
          <NavLink to="/messagerie" className={navClass}>
            <span className="mp-ico material-symbols-outlined">chat</span>
            Messagerie
          </NavLink>
          <NavLink to="/parametres" className={navClass}>
            <span className="mp-ico material-symbols-outlined">settings</span>
            Paramètres
          </NavLink>
        </nav>
        {!hideMemberModules ? (
          <NavLink
            to="/planning"
            className="mp-cta-sidebar mp-cta-sidebar--active"
            style={{ textDecoration: 'none', textAlign: 'center' }}
          >
            Voir le planning
          </NavLink>
        ) : null}
      </aside>

      <div className="mp-main-wrap">
        <header className="mp-topbar">
          <div className="mp-breadcrumb">
            <span className="mp-bc-muted">Espace membre</span>
            <span className="mp-bc-sep material-symbols-outlined">chevron_right</span>
            <span className="mp-bc-current">{crumb}</span>
          </div>
          <div className="mp-topbar-actions">
            <MemberRoleToggle
              variant="header"
              canAccessClubBackOffice={canAccessClubBackOffice}
              adminWorkspaceClubId={adminWorkspaceClubId}
            />
            {showSwitcher ? (
              <div className="mp-profile-chips" role="group" aria-label="Changer de profil">
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
            {canManageCart ? (
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
              onClick={() => {
                clearAuth();
                void navigate('/login', { replace: true });
              }}
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

      <nav className="mp-bottom" aria-label="Navigation mobile">
        <NavLink to="/" end className={bottomClass}>
          <span className="material-symbols-outlined">dashboard</span>
          <span>Accueil</span>
        </NavLink>
        {!hideMemberModules ? (
          <>
            <NavLink to="/progression" className={bottomClass}>
              <span className="material-symbols-outlined">school</span>
              <span>Progrès</span>
            </NavLink>
            <NavLink to="/planning" className={bottomClass}>
              <span className="material-symbols-outlined">calendar_today</span>
              <span>Planning</span>
            </NavLink>
          </>
        ) : null}
        <NavLink to="/famille" className={bottomClass}>
          <span className="material-symbols-outlined">groups</span>
          <span>Famille</span>
        </NavLink>
        <NavLink to="/messagerie" className={bottomClass}>
          <span className="material-symbols-outlined">chat</span>
          <span>Chat</span>
        </NavLink>
        <NavLink to="/parametres" className={bottomClass}>
          <span className="material-symbols-outlined">settings</span>
          <span>Profil</span>
        </NavLink>
      </nav>
    </div>
  );
}
