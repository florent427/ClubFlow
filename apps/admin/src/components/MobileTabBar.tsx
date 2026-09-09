import { NavLink, useLocation } from 'react-router-dom';
import { useClubModules } from '../lib/club-modules-context';
import type { ModuleCodeStr } from '../lib/module-catalog';
import { MOBILE_TABS, tabIsActive, type MobileTab } from './mobile-tabs';

/**
 * Barre d'onglets fixée en bas de l'écran en mode mobile (< 900px).
 *
 * Rendue uniquement par `AdminLayout` quand `useIsMobile()` est vrai ; le
 * CSS la masque de toute façon au-dessus du point de rupture.
 *
 * `MobileTabBarView` est la partie pure (sans router ni contexte) : c'est
 * elle que les tests exercent.
 */
export function MobileTabBarView({
  tabs,
  currentPath,
  isEnabled,
  navOpen,
  onToggleNav,
}: {
  tabs: readonly MobileTab[];
  currentPath: string;
  /** `null` pendant le chargement des modules : rien n'est grisé. */
  isEnabled: ((code: ModuleCodeStr) => boolean) | null;
  navOpen: boolean;
  onToggleNav: () => void;
}) {
  return (
    <nav className="cf-tabbar" aria-label="Navigation rapide">
      {tabs.map((tab) => {
        const denied =
          isEnabled !== null &&
          (tab.modules ?? []).some((code) => !isEnabled(code));
        // Menu ouvert : c'est lui l'onglet courant, la page passe en retrait.
        const active = !navOpen && tabIsActive(tab, currentPath);
        const className = `cf-tabbar__item${
          active ? ' cf-tabbar__item--active' : ''
        }${denied ? ' cf-tabbar__item--disabled' : ''}`;
        const content = (
          <>
            <span className="material-symbols-outlined" aria-hidden>
              {tab.icon}
            </span>
            <span className="cf-tabbar__label">{tab.label}</span>
          </>
        );
        if (denied) {
          return (
            <span
              key={tab.to}
              className={className}
              aria-disabled="true"
              title="Module désactivé — activez-le dans Modules du club."
            >
              {content}
            </span>
          );
        }
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={className}
          >
            {content}
          </NavLink>
        );
      })}
      <button
        type="button"
        className={`cf-tabbar__item${navOpen ? ' cf-tabbar__item--active' : ''}`}
        onClick={onToggleNav}
        aria-expanded={navOpen}
        aria-controls="cf-sidenav"
        aria-label={navOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
      >
        <span className="material-symbols-outlined" aria-hidden>
          {navOpen ? 'close' : 'menu'}
        </span>
        <span className="cf-tabbar__label">Menu</span>
      </button>
    </nav>
  );
}

export function MobileTabBar({
  navOpen,
  onToggleNav,
}: {
  navOpen: boolean;
  onToggleNav: () => void;
}) {
  const { isEnabled, loading } = useClubModules();
  const { pathname } = useLocation();
  return (
    <MobileTabBarView
      tabs={MOBILE_TABS}
      currentPath={pathname}
      isEnabled={loading ? null : isEnabled}
      navOpen={navOpen}
      onToggleNav={onToggleNav}
    />
  );
}
