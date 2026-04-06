import { Outlet } from 'react-router-dom';
import { ModuleGatedNavLink } from '../../components/ModuleGatedNavLink';
import { MembersCommandPalette } from './MembersCommandPalette';

export function MembersLayout() {
  return (
    <div className="members-loom">
      <nav className="members-subnav" aria-label="Sous-sections membres">
        <ModuleGatedNavLink
          to="/members"
          end
          modules={['MEMBERS']}
          disabledClassName="members-subnav__link--disabled"
          className={({ isActive }) =>
            `members-subnav__link${isActive ? ' members-subnav__link--active' : ''}`
          }
        >
          Annuaire
        </ModuleGatedNavLink>
        <ModuleGatedNavLink
          to="/members/grades"
          modules={['MEMBERS']}
          disabledClassName="members-subnav__link--disabled"
          className={({ isActive }) =>
            `members-subnav__link${isActive ? ' members-subnav__link--active' : ''}`
          }
        >
          Grades
        </ModuleGatedNavLink>
        <ModuleGatedNavLink
          to="/members/dynamic-groups"
          modules={['MEMBERS']}
          disabledClassName="members-subnav__link--disabled"
          className={({ isActive }) =>
            `members-subnav__link${isActive ? ' members-subnav__link--active' : ''}`
          }
        >
          Groupes dynamiques
        </ModuleGatedNavLink>
        <ModuleGatedNavLink
          to="/members/roles"
          modules={['MEMBERS']}
          disabledClassName="members-subnav__link--disabled"
          className={({ isActive }) =>
            `members-subnav__link${isActive ? ' members-subnav__link--active' : ''}`
          }
        >
          Rôles
        </ModuleGatedNavLink>
        <ModuleGatedNavLink
          to="/members/families"
          modules={['MEMBERS', 'FAMILIES']}
          disabledClassName="members-subnav__link--disabled"
          className={({ isActive }) =>
            `members-subnav__link${isActive ? ' members-subnav__link--active' : ''}`
          }
        >
          Familles &amp; payeurs
        </ModuleGatedNavLink>
      </nav>
      <p className="members-palette-hint muted">
        Recherche rapide : <kbd className="members-kbd">Ctrl</kbd> +{' '}
        <kbd className="members-kbd">K</kbd> (ou{' '}
        <kbd className="members-kbd">⌘</kbd> + <kbd className="members-kbd">K</kbd>)
      </p>
      <MembersCommandPalette />
      <Outlet />
    </div>
  );
}
