import { Outlet } from 'react-router-dom';
import { ModuleGatedNavLink } from '../../components/ModuleGatedNavLink';

export function SettingsLayout() {
  return (
    <div className="members-loom settings-loom">
      <nav className="members-subnav" aria-label="Sous-sections paramètres">
        <ModuleGatedNavLink
          to="/settings"
          end
          modules={[]}
          disabledClassName="members-subnav__link--disabled"
          className={({ isActive }) =>
            `members-subnav__link${isActive ? ' members-subnav__link--active' : ''}`
          }
        >
          Accueil
        </ModuleGatedNavLink>
        <ModuleGatedNavLink
          to="/settings/member-fields"
          modules={['MEMBERS']}
          disabledClassName="members-subnav__link--disabled"
          className={({ isActive }) =>
            `members-subnav__link${isActive ? ' members-subnav__link--active' : ''}`
          }
        >
          Fiche adhérent
        </ModuleGatedNavLink>
        <ModuleGatedNavLink
          to="/settings/adhesion"
          modules={['MEMBERS', 'PAYMENT']}
          disabledClassName="members-subnav__link--disabled"
          className={({ isActive }) =>
            `members-subnav__link${isActive ? ' members-subnav__link--active' : ''}`
          }
        >
          Adhésion
        </ModuleGatedNavLink>
        <ModuleGatedNavLink
          to="/settings/pricing-rules"
          modules={['PAYMENT']}
          disabledClassName="members-subnav__link--disabled"
          className={({ isActive }) =>
            `members-subnav__link${isActive ? ' members-subnav__link--active' : ''}`
          }
        >
          Frais paiement
        </ModuleGatedNavLink>
        <ModuleGatedNavLink
          to="/settings/mail-domain"
          modules={['COMMUNICATION']}
          disabledClassName="members-subnav__link--disabled"
          className={({ isActive }) =>
            `members-subnav__link${isActive ? ' members-subnav__link--active' : ''}`
          }
        >
          E-mail
        </ModuleGatedNavLink>
        <ModuleGatedNavLink
          to="/settings/branding"
          modules={[]}
          disabledClassName="members-subnav__link--disabled"
          className={({ isActive }) =>
            `members-subnav__link${isActive ? ' members-subnav__link--active' : ''}`
          }
        >
          Identité
        </ModuleGatedNavLink>
      </nav>
      <Outlet />
    </div>
  );
}
