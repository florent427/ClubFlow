import { NavLink, Outlet } from 'react-router-dom';

export function SettingsLayout() {
  return (
    <div className="members-loom settings-loom">
      <nav className="members-subnav" aria-label="Sous-sections paramètres">
        <NavLink
          to="/settings"
          end
          className={({ isActive }) =>
            `members-subnav__link${isActive ? ' members-subnav__link--active' : ''}`
          }
        >
          Accueil
        </NavLink>
        <NavLink
          to="/settings/member-fields"
          className={({ isActive }) =>
            `members-subnav__link${isActive ? ' members-subnav__link--active' : ''}`
          }
        >
          Fiche adhérent
        </NavLink>
        <NavLink
          to="/settings/adhesion"
          className={({ isActive }) =>
            `members-subnav__link${isActive ? ' members-subnav__link--active' : ''}`
          }
        >
          Adhésion
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
