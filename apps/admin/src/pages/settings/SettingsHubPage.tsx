import { Link } from 'react-router-dom';

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
              <Link to="/settings/member-fields" className="settings-hub-card">
                <span className="settings-hub-card__title">Fiche adhérent</span>
                <span className="settings-hub-card__desc">
                  Champs du catalogue (e-mail, adresse…) et champs personnalisés.
                </span>
              </Link>
            </li>
            <li>
              <Link to="/settings/adhesion" className="settings-hub-card">
                <span className="settings-hub-card__title">Adhésion</span>
                <span className="settings-hub-card__desc">
                  Saisons sportives et formules de cotisation (module Paiement).
                </span>
              </Link>
            </li>
            <li>
              <Link to="/settings/mail-domain" className="settings-hub-card">
                <span className="settings-hub-card__title">
                  E-mail (domaine)
                </span>
                <span className="settings-hub-card__desc">
                  SMTP, domaine d’expédition — requis pour les campagnes e-mail.
                </span>
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
