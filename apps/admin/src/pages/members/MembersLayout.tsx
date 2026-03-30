import { NavLink, Outlet } from 'react-router-dom';
import { MembersCommandPalette } from './MembersCommandPalette';
import { MembersUiProvider } from './members-ui-context';

export function MembersLayout() {
  return (
    <MembersUiProvider>
      <div className="members-loom">
        <nav className="members-subnav" aria-label="Sous-sections membres">
          <NavLink
            to="/members"
            end
            className={({ isActive }) =>
              `members-subnav__link${isActive ? ' members-subnav__link--active' : ''}`
            }
          >
            Annuaire
          </NavLink>
          <NavLink
            to="/members/grades"
            className={({ isActive }) =>
              `members-subnav__link${isActive ? ' members-subnav__link--active' : ''}`
            }
          >
            Grades
          </NavLink>
          <NavLink
            to="/members/dynamic-groups"
            className={({ isActive }) =>
              `members-subnav__link${isActive ? ' members-subnav__link--active' : ''}`
            }
          >
            Groupes dynamiques
          </NavLink>
          <NavLink
            to="/members/roles"
            className={({ isActive }) =>
              `members-subnav__link${isActive ? ' members-subnav__link--active' : ''}`
            }
          >
            Rôles
          </NavLink>
          <NavLink
            to="/members/families"
            className={({ isActive }) =>
              `members-subnav__link${isActive ? ' members-subnav__link--active' : ''}`
            }
          >
            Familles &amp; payeurs
          </NavLink>
        </nav>
        <p className="members-palette-hint muted">
          Recherche rapide : <kbd className="members-kbd">Ctrl</kbd> +{' '}
          <kbd className="members-kbd">K</kbd> (ou{' '}
          <kbd className="members-kbd">⌘</kbd> + <kbd className="members-kbd">K</kbd>)
        </p>
        <MembersCommandPalette />
        <Outlet />
      </div>
    </MembersUiProvider>
  );
}
