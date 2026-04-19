import { JoinFamilyByPayerEmailCta } from '../components/JoinFamilyByPayerEmailCta';

/**
 * Recommandation UX #5 — Glossaire UX / Onboarding contact
 * Écran d'onboarding enrichi après vérification de l'e-mail, qui explique
 * clairement ce que l'utilisateur peut faire avec son compte contact et
 * ce qui nécessite l'intervention du club.
 */
export function ContactHomePage() {
  return (
    <div className="mp-page">
      <section className="mp-hero">
        <div className="mp-hero-head">
          <p className="mp-eyebrow">Bienvenue</p>
          <h1 className="mp-hero-title">Votre espace contact</h1>
          <p className="mp-hero-lead">
            Votre compte est actif et vérifié. Voici ce que vous pouvez faire
            dès maintenant.
          </p>
        </div>
      </section>

      <JoinFamilyByPayerEmailCta variant="dashboard" />

      <div className="mp-onboarding-grid">
        <div className="mp-onboarding-card mp-onboarding-card--ok">
          <span className="material-symbols-outlined mp-onboarding-ico">check_circle</span>
          <div>
            <strong>Consulter les factures</strong>
            <p className="mp-hint">
              Accédez à la section « Famille » pour voir les factures liées à
              votre espace familial.
            </p>
          </div>
        </div>

        <div className="mp-onboarding-card mp-onboarding-card--ok">
          <span className="material-symbols-outlined mp-onboarding-ico">group_add</span>
          <div>
            <strong>Gérer les profils de vos enfants</strong>
            <p className="mp-hint">
              Si le club a rattaché vos enfants à votre compte, vous pouvez
              basculer entre leurs profils depuis la barre supérieure.
            </p>
          </div>
        </div>

        <div className="mp-onboarding-card mp-onboarding-card--wait">
          <span className="material-symbols-outlined mp-onboarding-ico">hourglass_top</span>
          <div>
            <strong>Espace membre complet</strong>
            <p className="mp-hint">
              Le planning, la progression et les réservations seront
              disponibles lorsque le club aura créé votre fiche sportive.
              Contactez le secrétariat si nécessaire.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
