import { useQuery } from '@apollo/client/react';
import {
  NavLink,
  Outlet,
  useLocation,
} from 'react-router-dom';
import { VIEWER_PROFILES } from '../lib/documents';
import type {
  ViewerProfilesQueryData,
} from '../lib/auth-types';
import type { ClubQueryData } from '../lib/viewer-types';
import { getClubId } from '../lib/storage';
import { CLUB, VIEWER_ADMIN_SWITCH, VIEWER_ME } from '../lib/viewer-documents';
import type { ViewerAdminSwitchData, ViewerMeData } from '../lib/viewer-types';
import { PendingFamilyInvitesBanner } from './PendingFamilyInvitesBanner';
import { PinGate } from './PinGate';
import { UserMenu } from './UserMenu';
import {
  VIEWER_ACTIVE_CART,
  type ViewerActiveCartData,
} from '../lib/cart-documents';

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
  const clubId = getClubId();

  const { data: profilesData } = useQuery<ViewerProfilesQueryData>(
    VIEWER_PROFILES,
    { fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first' },
  );

  const { data: meData } = useQuery<ViewerMeData>(VIEWER_ME, {
    skip: !clubId,
    fetchPolicy: 'cache-first',
  });

  const { data: clubData } = useQuery<ClubQueryData>(CLUB, {
    skip: !clubId,
    fetchPolicy: 'cache-first',
  });

  // Compteur global "panier d'adhésion" affiché en topbar quand le viewer
  // peut gérer un panier (payeur du foyer).
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

  const profiles = profilesData?.viewerProfiles ?? [];
  const hideMemberModules = meData?.viewerMe?.hideMemberModules === true;
  const canManageMembershipCart =
    meData?.viewerMe?.canManageMembershipCart === true;
  const adminSwitch = adminSwitchData?.viewerAdminSwitch;
  // Bouton Administration n'est visible QUE si l'utilisateur est admin
  // du CLUB COURANT (pas d'un autre club). Évite la confusion d'un user
  // admin de B mais sur le portail membre du club A — on ne propose pas
  // de bascule vers l'admin de B depuis le menu personnel.
  const canAdminCurrentClub: boolean =
    adminSwitch?.canAccessClubBackOffice === true &&
    adminSwitch?.adminWorkspaceClubId === clubId;
  const clubName = clubData?.club?.name ?? null;

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
          {canManageMembershipCart ? (
            <NavLink to="/famille" className={navClass}>
              <span className="mp-ico material-symbols-outlined">groups</span>
              Famille &amp; partage
            </NavLink>
          ) : null}
          {canManageMembershipCart ? (
            <NavLink to="/adhesion" className={navClass}>
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
          {canManageMembershipCart ? (
            <NavLink to="/factures" className={navClass}>
              <span className="mp-ico material-symbols-outlined">
                receipt_long
              </span>
              Factures
            </NavLink>
          ) : null}
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
            {/* Notifications toujours visibles : panier badge rouge si
                items. Le reste des actions (admin, profils, settings,
                logout) est groupé dans UserMenu pour éviter la
                prolifération d'icônes (devient illisible avec un foyer
                à 5+ membres). */}
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
            <UserMenu
              me={meData?.viewerMe ?? null}
              clubName={clubName}
              profiles={profiles}
              canAdminCurrentClub={canAdminCurrentClub}
              currentClubId={clubId}
            />
          </div>
        </header>

        <main className="mp-content">
          <PendingFamilyInvitesBanner />
          <PinGate>
            <Outlet />
          </PinGate>
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
        {canManageMembershipCart ? (
          <NavLink to="/famille" className={bottomClass}>
            <span className="material-symbols-outlined">groups</span>
            <span>Famille</span>
          </NavLink>
        ) : null}
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
