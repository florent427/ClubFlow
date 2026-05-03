import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@apollo/client/react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ModuleGatedNavLink } from './ModuleGatedNavLink';
import { ModuleRouteGuard } from './ModuleRouteGuard';
import { GlobalSearchBar } from './GlobalSearchBar';
import { AikoChatWidget } from './agent/AikoChatWidget';
import { VIEWER_PROFILES } from '../lib/documents';
import { apolloClient } from '../lib/apollo';
import { navigateToMemberPortal } from '../lib/member-portal-switch';
import type { ViewerProfilesQueryData } from '../lib/types';
import { clearSession, getClubId, getToken, isLoggedIn } from '../lib/storage';
import {
  ADMIN_FOOTER_ITEMS,
  NAV_SECTIONS,
  PINNED_ITEMS,
  type NavItem,
  type NavSection,
  type NavSubItem,
} from './nav-config';

const LS_KEY_COLLAPSED = 'cf-nav-collapsed-sections';

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

/**
 * Détermine si un chemin donné est considéré comme « actif » pour un lien
 * (utilisé pour l'auto-expand des items avec sous-menu et des sections).
 */
function pathMatches(
  currentPath: string,
  target: string,
  end?: boolean,
): boolean {
  if (end) return currentPath === target;
  if (target === '/') return currentPath === '/';
  return currentPath === target || currentPath.startsWith(`${target}/`);
}

/** Vrai si la section contient le chemin courant (pour auto-expand). */
function sectionContainsPath(section: NavSection, path: string): boolean {
  return section.items.some(
    (item) =>
      pathMatches(path, item.to, item.end) ||
      (item.children?.some((c) => pathMatches(path, c.to, c.end)) ?? false),
  );
}

/** Vrai si un item avec sous-menu a un enfant actif (pour auto-expand). */
function itemHasActiveChild(item: NavItem, path: string): boolean {
  if (!item.children) return false;
  return item.children.some((c) => pathMatches(path, c.to, c.end));
}

/**
 * Rendu d'un item de navigation.
 *
 * - Sans `modules` : NavLink simple avec classes cf-sidenav__link.
 * - Avec `modules` : ModuleGatedNavLink (grisage si module désactivé).
 * - Avec `children` : wrapper avec bouton expand + sous-liste.
 */
function NavItemRow({
  item,
  expanded,
  onToggle,
  currentPath,
}: {
  item: NavItem;
  expanded: boolean;
  onToggle: () => void;
  currentPath: string;
}) {
  const hasChildren = !!item.children && item.children.length > 0;
  const hasActiveChild = hasChildren && itemHasActiveChild(item, currentPath);
  const isItemActive =
    pathMatches(currentPath, item.to, item.end) && !hasActiveChild;

  const linkClassName = ({ isActive }: { isActive: boolean }) =>
    `cf-sidenav__link${
      isActive || isItemActive ? ' cf-sidenav__link--active' : ''
    }${hasChildren ? ' cf-sidenav__link--has-children' : ''}`;

  const linkContent = (
    <>
      <span className="material-symbols-outlined" aria-hidden>
        {item.icon}
      </span>
      <span className="cf-sidenav__link-label">{item.label}</span>
      {hasChildren && (
        <button
          type="button"
          className={`cf-sidenav__link-chevron${
            expanded ? ' cf-sidenav__link-chevron--open' : ''
          }`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggle();
          }}
          aria-label={expanded ? 'Réduire' : 'Déplier'}
          aria-expanded={expanded}
        >
          <span className="material-symbols-outlined" aria-hidden>
            expand_more
          </span>
        </button>
      )}
    </>
  );

  const linkElement = item.modules ? (
    <ModuleGatedNavLink
      to={item.to}
      modules={item.modules}
      className={linkClassName}
      end={item.end}
    >
      {linkContent}
    </ModuleGatedNavLink>
  ) : (
    <NavLink to={item.to} className={linkClassName} end={item.end}>
      {linkContent}
    </NavLink>
  );

  return (
    <div className="cf-sidenav__item">
      {linkElement}
      {hasChildren && expanded && (
        <ul className="cf-sidenav__sublist" role="list">
          {item.children!.map((sub) => (
            <SubItemRow
              key={sub.to + sub.label}
              sub={sub}
              currentPath={currentPath}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Rendu d'un sous-item. */
function SubItemRow({
  sub,
  currentPath,
}: {
  sub: NavSubItem;
  currentPath: string;
}) {
  const isActive = pathMatches(currentPath, sub.to, sub.end);
  const className = ({ isActive: routerActive }: { isActive: boolean }) =>
    `cf-sidenav__sublink${
      routerActive || isActive ? ' cf-sidenav__sublink--active' : ''
    }`;
  const content = <span>{sub.label}</span>;
  return (
    <li>
      {sub.modules ? (
        <ModuleGatedNavLink
          to={sub.to}
          modules={sub.modules}
          className={className}
          end={sub.end}
          disabledClassName="cf-sidenav__sublink--disabled"
        >
          {content}
        </ModuleGatedNavLink>
      ) : (
        <NavLink to={sub.to} className={className} end={sub.end}>
          {content}
        </NavLink>
      )}
    </li>
  );
}

export function AdminLayout({ children }: { children?: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
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

  /**
   * État collapse par section. Clé = section.id, valeur = true si collapsed.
   * Persisté dans localStorage. Au mount, on auto-déplie la section
   * contenant le path courant même si elle était collapsed dans le storage,
   * pour que l'utilisateur voie toujours où il est.
   */
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >(() => {
    try {
      const raw = localStorage.getItem(LS_KEY_COLLAPSED);
      if (!raw) return {};
      return JSON.parse(raw) as Record<string, boolean>;
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY_COLLAPSED, JSON.stringify(collapsedSections));
    } catch {
      /* quota, private mode, etc. — on ignore silencieusement */
    }
  }, [collapsedSections]);

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }, []);

  /**
   * Pour les items avec sous-menu : expanded automatiquement si un enfant
   * est actif, sinon état local persisté par clé `item.to`.
   */
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>(
    {},
  );
  const toggleItem = useCallback((key: string) => {
    setExpandedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  /**
   * À chaque changement de route, auto-expand l'item parent s'il contient
   * la route courante. Permet à l'user qui tape une URL directe de voir
   * le fil d'Ariane sidebar correctement déplié.
   */
  useEffect(() => {
    setExpandedItems((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const section of NAV_SECTIONS) {
        for (const item of section.items) {
          if (itemHasActiveChild(item, location.pathname) && !next[item.to]) {
            next[item.to] = true;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [location.pathname]);

  const sectionsToRender = useMemo(() => {
    return NAV_SECTIONS.map((section) => {
      const hasActive = sectionContainsPath(section, location.pathname);
      // Si la section contient la route courante, on force expanded
      // (visibilité > préférence user). Sinon, on respecte le storage.
      const userCollapsed = collapsedSections[section.id];
      const collapsed = hasActive ? false : (userCollapsed ?? false);
      return { section, collapsed };
    });
  }, [collapsedSections, location.pathname]);

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

        <nav className="cf-sidenav__nav" aria-label="Modules">
          {/* Pinned : tableau de bord + Aïko toujours visibles */}
          <div className="cf-sidenav__pinned">
            {PINNED_ITEMS.map((item) => (
              <NavItemRow
                key={item.to}
                item={item}
                expanded={expandedItems[item.to] ?? false}
                onToggle={() => toggleItem(item.to)}
                currentPath={location.pathname}
              />
            ))}
          </div>

          {/* Sections thématiques collapsibles */}
          {sectionsToRender.map(({ section, collapsed }) => (
            <div
              key={section.id}
              className={`cf-sidenav__section-group${
                collapsed ? ' cf-sidenav__section-group--collapsed' : ''
              }`}
            >
              <button
                type="button"
                className="cf-sidenav__section-header"
                onClick={() => toggleSection(section.id)}
                aria-expanded={!collapsed}
              >
                <span className="cf-sidenav__section-label">
                  {section.label}
                </span>
                <span
                  className="material-symbols-outlined cf-sidenav__section-chevron"
                  aria-hidden
                >
                  expand_more
                </span>
              </button>
              {!collapsed && (
                <div className="cf-sidenav__section-items">
                  {section.items.map((item) => (
                    <NavItemRow
                      key={item.to}
                      item={item}
                      expanded={
                        (expandedItems[item.to] ?? false) ||
                        itemHasActiveChild(item, location.pathname)
                      }
                      onToggle={() => toggleItem(item.to)}
                      currentPath={location.pathname}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Footer admin fixe */}
          <div className="cf-sidenav__admin-footer">
            <span className="cf-sidenav__section-label cf-sidenav__section-label--static">
              Administration
            </span>
            {ADMIN_FOOTER_ITEMS.map((item) => (
              <NavItemRow
                key={item.to}
                item={item}
                expanded={expandedItems[item.to] ?? false}
                onToggle={() => toggleItem(item.to)}
                currentPath={location.pathname}
              />
            ))}
            <button
              type="button"
              className="cf-sidenav__link cf-sidenav__link--button"
              onClick={() => logout()}
            >
              <span className="material-symbols-outlined" aria-hidden>
                logout
              </span>
              <span className="cf-sidenav__link-label">Déconnexion</span>
            </button>
          </div>
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
