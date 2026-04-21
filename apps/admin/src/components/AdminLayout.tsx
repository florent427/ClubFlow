import type { ReactNode } from 'react';
import { useQuery } from '@apollo/client/react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ModuleGatedNavLink } from './ModuleGatedNavLink';
import { ModuleRouteGuard } from './ModuleRouteGuard';
import { GlobalSearchBar } from './GlobalSearchBar';
import { AikoChatWidget } from './agent/AikoChatWidget';
import { VIEWER_PROFILES } from '../lib/documents';
import { apolloClient } from '../lib/apollo';
import { navigateToMemberPortal } from '../lib/member-portal-switch';
import type { ViewerProfilesQueryData } from '../lib/types';
import { clearSession, getClubId, getToken, isLoggedIn } from '../lib/storage';

function decodeJwtEmail(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = JSON.parse(atob(part)) as { email?: string };
    return json.email ?? null;
  } catch {
    return null;
  }
}

function displayNameFromEmail(email: string | null): string {
  if (!email) return 'Admin';
  const local = email.split('@')[0] ?? 'Admin';
  if (!local) return 'Admin';
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

function initialsFromEmail(email: string | null): string {
  if (!email) return 'CF';
  const local = email.split('@')[0] ?? '';
  if (local.length >= 2) return local.slice(0, 2).toUpperCase();
  return (email.slice(0, 2) || 'CF').toUpperCase();
}

export function AdminLayout({ children }: { children?: ReactNode }) {
  const navigate = useNavigate();
  const token = getToken();
  const clubId = getClubId();
  const loggedIn = isLoggedIn();
  const emailHint = token ? decodeJwtEmail(token) : null;
  const displayName = displayNameFromEmail(emailHint);

  const { data: viewerProfilesData } = useQuery<ViewerProfilesQueryData>(
    VIEWER_PROFILES,
    { skip: !loggedIn, fetchPolicy: 'cache-and-network' },
  );
  const viewerProfiles = viewerProfilesData?.viewerProfiles ?? [];
  const hasMemberProfiles = viewerProfiles.length > 0;
  const personnelTitle = hasMemberProfiles
    ? 'Ouvrir l’espace personnel (portail membre)'
    : 'Aucun profil membre lié à ce compte. Contactez votre club.';

  function goPersonnel() {
    if (!hasMemberProfiles || !token || !clubId) return;
    navigateToMemberPortal(token, clubId);
  }

  function logout() {
    clearSession();
    void apolloClient.clearStore();
    void navigate('/login', { replace: true });
  }

  return (
    <div className="cf-shell">
      <aside className="cf-sidenav" aria-label="Navigation principale">
        <div className="cf-sidenav__brand">
          <span
            className="material-symbols-outlined cf-sidenav__brand-icon"
            aria-hidden
          >
            analytics
          </span>
          <span className="cf-sidenav__brand-text">ClubFlow</span>
        </div>

        <nav className="cf-sidenav__nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
            }
          >
            <span className="material-symbols-outlined" aria-hidden>
              dashboard
            </span>
            <span>Tableau de bord</span>
          </NavLink>
          <NavLink
            to="/agent"
            className={({ isActive }) =>
              `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
            }
          >
            <span className="material-symbols-outlined" aria-hidden>
              smart_toy
            </span>
            <span>Aïko · Agent IA</span>
          </NavLink>
          <ModuleGatedNavLink
            to="/members"
            modules={['MEMBERS']}
            className={({ isActive }) =>
              `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
            }
          >
            <span className="material-symbols-outlined" aria-hidden>
              group
            </span>
            <span>Gestion des membres</span>
          </ModuleGatedNavLink>
          <ModuleGatedNavLink
            to="/contacts"
            modules={['MEMBERS']}
            className={({ isActive }) =>
              `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
            }
          >
            <span className="material-symbols-outlined" aria-hidden>
              contacts
            </span>
            <span>Contacts</span>
          </ModuleGatedNavLink>
          <ModuleGatedNavLink
            to="/members/dynamic-groups"
            modules={['MEMBERS']}
            className={({ isActive }) =>
              `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
            }
          >
            <span className="material-symbols-outlined" aria-hidden>
              category
            </span>
            <span>Groupes dynamiques</span>
          </ModuleGatedNavLink>
          <ModuleGatedNavLink
            to="/settings/adhesion"
            modules={['MEMBERS', 'PAYMENT']}
            className={({ isActive }) =>
              `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
            }
          >
            <span className="material-symbols-outlined" aria-hidden>
              groups
            </span>
            <span>Adhésion &amp; formules</span>
          </ModuleGatedNavLink>
          <ModuleGatedNavLink
            to="/planning"
            modules={['PLANNING']}
            className={({ isActive }) =>
              `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
            }
          >
            <span className="material-symbols-outlined" aria-hidden>
              calendar_today
            </span>
            <span>Planning sportif</span>
          </ModuleGatedNavLink>

          <ModuleGatedNavLink
            to="/billing"
            modules={['PAYMENT']}
            className={({ isActive }) =>
              `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
            }
          >
            <span className="material-symbols-outlined" aria-hidden>
              payments
            </span>
            <span>Facturation</span>
          </ModuleGatedNavLink>
          <ModuleGatedNavLink
            to="/communication"
            modules={['COMMUNICATION']}
            className={({ isActive }) =>
              `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
            }
          >
            <span className="material-symbols-outlined" aria-hidden>
              campaign
            </span>
            <span>Communication</span>
          </ModuleGatedNavLink>
          <ModuleGatedNavLink
            to="/vie-du-club"
            modules={['CLUB_LIFE']}
            className={({ isActive }) =>
              `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
            }
          >
            <span className="material-symbols-outlined" aria-hidden>
              forum
            </span>
            <span>Vie du club</span>
          </ModuleGatedNavLink>
          <ModuleGatedNavLink
            to="/reservations"
            modules={['BOOKING']}
            className={({ isActive }) =>
              `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
            }
          >
            <span className="material-symbols-outlined" aria-hidden>
              event_available
            </span>
            <span>Réservations</span>
          </ModuleGatedNavLink>
          <ModuleGatedNavLink
            to="/evenements"
            modules={['EVENTS']}
            className={({ isActive }) =>
              `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
            }
          >
            <span className="material-symbols-outlined" aria-hidden>
              event
            </span>
            <span>Événements</span>
          </ModuleGatedNavLink>
          <ModuleGatedNavLink
            to="/blog"
            modules={['BLOG']}
            className={({ isActive }) =>
              `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
            }
          >
            <span className="material-symbols-outlined" aria-hidden>
              article
            </span>
            <span>Blog</span>
          </ModuleGatedNavLink>
          <ModuleGatedNavLink
            to="/boutique"
            modules={['SHOP']}
            className={({ isActive }) =>
              `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
            }
          >
            <span className="material-symbols-outlined" aria-hidden>
              storefront
            </span>
            <span>Boutique</span>
          </ModuleGatedNavLink>
          <ModuleGatedNavLink
            to="/sponsoring"
            modules={['SPONSORING']}
            className={({ isActive }) =>
              `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
            }
          >
            <span className="material-symbols-outlined" aria-hidden>
              handshake
            </span>
            <span>Sponsoring</span>
          </ModuleGatedNavLink>
          <ModuleGatedNavLink
            to="/subventions"
            modules={['SUBSIDIES']}
            className={({ isActive }) =>
              `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
            }
          >
            <span className="material-symbols-outlined" aria-hidden>
              volunteer_activism
            </span>
            <span>Subventions</span>
          </ModuleGatedNavLink>
          <ModuleGatedNavLink
            to="/comptabilite"
            modules={['ACCOUNTING']}
            className={({ isActive }) =>
              `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
            }
          >
            <span className="material-symbols-outlined" aria-hidden>
              account_balance
            </span>
            <span>Comptabilité</span>
          </ModuleGatedNavLink>

          <NavLink
            to="/vitrine"
            className={({ isActive }) =>
              `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
            }
          >
            <span className="material-symbols-outlined" aria-hidden>
              public
            </span>
            <span>Site vitrine</span>
          </NavLink>

          <span className="cf-sidenav__section">Administration</span>
          <NavLink
            to="/club-modules"
            className={({ isActive }) =>
              `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
            }
          >
            <span className="material-symbols-outlined" aria-hidden>
              account_balance
            </span>
            <span>Modules du club</span>
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
            }
          >
            <span className="material-symbols-outlined" aria-hidden>
              settings
            </span>
            <span>Paramètres</span>
          </NavLink>
          <button
            type="button"
            className="cf-sidenav__link cf-sidenav__link--button"
            onClick={() => logout()}
          >
            <span className="material-symbols-outlined" aria-hidden>
              logout
            </span>
            <span>Déconnexion</span>
          </button>
        </nav>

        <div className="cf-sidenav__user">
          <div className="cf-sidenav__avatar" aria-hidden>
            {initialsFromEmail(emailHint)}
          </div>
          <div className="cf-sidenav__user-text">
            <p className="cf-sidenav__user-name">{displayName}</p>
            <p className="cf-sidenav__user-meta" title={emailHint ?? undefined}>
              {emailHint ?? 'Session'}
            </p>
          </div>
        </div>
      </aside>

      <header className="cf-topbar">
        <GlobalSearchBar />
        <div className="cf-topbar__actions">
          <div className="cf-role-toggle" role="group" aria-label="Vue">
            <button
              type="button"
              className="cf-role-toggle__btn cf-role-toggle__btn--on"
              aria-current="page"
              disabled
            >
              Admin
            </button>
            <button
              type="button"
              className="cf-role-toggle__btn"
              disabled={!hasMemberProfiles}
              title={personnelTitle}
              onClick={() => goPersonnel()}
            >
              Personnel
            </button>
          </div>
          <button
            type="button"
            className="cf-icon-btn"
            aria-label="Notifications (démo)"
          >
            <span className="material-symbols-outlined" aria-hidden>
              notifications
            </span>
            <span className="cf-icon-btn__dot" aria-hidden />
          </button>
          <div className="cf-topbar__profile">
            <div className="cf-topbar__profile-text">
              <p className="cf-topbar__profile-name">{displayName}</p>
              <p className="cf-topbar__profile-role">Administrateur club</p>
            </div>
            <div className="cf-topbar__avatar" aria-hidden>
              {initialsFromEmail(emailHint)}
            </div>
          </div>
        </div>
      </header>

      <main className="cf-main">
        <ModuleRouteGuard>{children ?? <Outlet />}</ModuleRouteGuard>
      </main>

      <footer className="cf-footer">
        <span>ClubFlow v0.2</span>
        <div className="cf-footer__links">
          <span className="cf-footer__muted">Support</span>
          <span className="cf-footer__muted">Documentation</span>
        </div>
      </footer>

      <AikoChatWidget />
    </div>
  );
}
