import { Link } from 'react-router-dom';
import { useClubModules } from '../../lib/club-modules-context';
import type { ModuleCodeStr } from '../../lib/module-catalog';

function SettingsHubCard({
  to,
  modules,
  title,
  desc,
}: {
  to: string;
  modules: ModuleCodeStr[];
  title: string;
  desc: string;
}) {
  const { isEnabled, loading } = useClubModules();
  const denied =
    !loading && modules.some((m) => !isEnabled(m));
  if (denied) {
    return (
      <span
        className="settings-hub-card settings-hub-card--disabled"
        title="Module désactivé — activez-le dans Modules du club."
      >
        <span className="settings-hub-card__title">{title}</span>
        <span className="settings-hub-card__desc">{desc}</span>
      </span>
    );
  }
  return (
    <Link to={to} className="settings-hub-card">
      <span className="settings-hub-card__title">{title}</span>
      <span className="settings-hub-card__desc">{desc}</span>
    </Link>
  );
}

export function SettingsHubPage() {
  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <p className="members-loom__eyebrow">Administration</p>
        <h1 className="members-loom__title">Paramètres</h1>
        <p className="members-loom__lede">
          Réglages du club — d’autres sections (facturation, communication,
          etc.) seront ajoutées ici.
        </p>
      </header>

      <div className="members-loom__grid members-loom__grid--single">
        <section className="members-panel">
          <h2 className="members-panel__h">Sections</h2>
          <ul className="settings-hub-cards">
            <li>
              <SettingsHubCard
                to="/settings/member-fields"
                modules={['MEMBERS']}
                title="Fiche adhérent"
                desc="Champs du catalogue (e-mail, adresse…) et champs personnalisés."
              />
            </li>
            <li>
              <SettingsHubCard
                to="/settings/adhesion"
                modules={['MEMBERS', 'PAYMENT']}
                title="Adhésion"
                desc="Saisons sportives et formules de cotisation (module Paiement)."
              />
            </li>
            <li>
              <SettingsHubCard
                to="/settings/mail-domain"
                modules={['COMMUNICATION']}
                title="E-mail (domaine)"
                desc="SMTP, domaine d’expédition — requis pour les campagnes e-mail."
              />
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
