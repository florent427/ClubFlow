import Link from 'next/link';

export default function HomePage() {
  return (
    <>
      <section className="hero container">
        <h1>
          La plateforme tout-en-un<br />
          pour <span className="accent">gérer votre club</span>
        </h1>
        <p className="lede">
          Adhésions, planning, communication, comptabilité, vitrine web…
          ClubFlow réunit tout ce dont votre club sportif ou associatif a besoin.
          Gratuit pour démarrer.
        </p>
        <div className="cta-row">
          <Link href="/signup" className="btn btn-primary btn-lg">
            Créer mon club gratuitement
          </Link>
          <Link href="/#features" className="btn btn-secondary btn-lg">
            Découvrir les fonctionnalités
          </Link>
        </div>
        <p className="reassurance muted">
          ✓ Sans CB · ✓ Hébergé en France · ✓ Conforme RGPD · ✓ Sans limite de membres
        </p>
      </section>

      <section id="features" className="features container">
        <h2>Tout ce qu'il faut pour faire tourner un club</h2>
        <div className="grid">
          <Feature emoji="👥" title="Membres & familles">
            Fiches adhérents, familles, certificats médicaux, rôles et grades.
          </Feature>
          <Feature emoji="💳" title="Adhésions & paiements">
            Panier, factures, OCR de reçus, comptabilité associative intégrée.
          </Feature>
          <Feature emoji="📅" title="Planning & événements">
            Cours, stages, compétitions, réservation de créneaux.
          </Feature>
          <Feature emoji="✉️" title="Communication multi-canal">
            Email, push notification, messagerie interne entre membres.
          </Feature>
          <Feature emoji="🌐" title="Site vitrine inclus">
            Votre site public sur sous-domaine ou domaine personnalisé.
          </Feature>
          <Feature emoji="📱" title="App mobile membres">
            Vos adhérents accèdent à leur espace depuis l'app iOS/Android.
          </Feature>
        </div>
      </section>

      <section id="pricing" className="pricing container">
        <h2>Gratuit. Sans astérisque.</h2>
        <p className="muted">
          ClubFlow est gratuit pendant la phase de lancement. Pas de carte bancaire,
          pas de période d'essai limitée — votre club, vos données, sans restrictions.
        </p>
        <div className="plan">
          <div className="plan-header">
            <span className="plan-name">Plan unique</span>
            <span className="plan-price">0 €<small>/mois</small></span>
          </div>
          <ul className="plan-features">
            <li>✓ Membres illimités</li>
            <li>✓ Tous les modules activables</li>
            <li>✓ Vitrine web (sous-domaine ou domaine custom)</li>
            <li>✓ App mobile membres</li>
            <li>✓ 300 emails/jour (Brevo)</li>
            <li>✓ Backups quotidiens</li>
            <li>✓ Hébergement France RGPD</li>
            <li>✓ Support par email</li>
          </ul>
          <Link href="/signup" className="btn btn-primary btn-lg">
            Créer mon club
          </Link>
        </div>
      </section>

      <style>{`
        .hero {
          padding: var(--space-24) var(--space-6) var(--space-16);
          text-align: center;
          max-width: 900px;
        }
        .accent {
          color: var(--color-primary);
        }
        .lede {
          font-size: 1.25rem;
          margin: var(--space-6) auto var(--space-8);
          max-width: 640px;
          color: var(--color-text-muted);
        }
        .cta-row {
          display: flex;
          gap: var(--space-4);
          justify-content: center;
          flex-wrap: wrap;
          margin-bottom: var(--space-6);
        }
        .btn-lg {
          padding: var(--space-4) var(--space-8);
          font-size: 1.05rem;
        }
        .reassurance {
          font-size: 0.9rem;
        }
        .features {
          padding: var(--space-16) var(--space-6);
        }
        .features h2 {
          text-align: center;
          margin-bottom: var(--space-12);
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: var(--space-6);
        }
        .feature {
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-6);
        }
        .feature-emoji {
          font-size: 2rem;
          margin-bottom: var(--space-3);
        }
        .feature h3 {
          margin-bottom: var(--space-2);
        }
        .pricing {
          padding: var(--space-16) var(--space-6);
          text-align: center;
        }
        .pricing h2 {
          margin-bottom: var(--space-3);
        }
        .pricing > .muted {
          max-width: 600px;
          margin: 0 auto var(--space-12);
        }
        .plan {
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-8);
          max-width: 480px;
          margin: 0 auto;
          text-align: left;
        }
        .plan-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: var(--space-6);
        }
        .plan-name {
          font-size: 1.1rem;
          font-weight: 600;
        }
        .plan-price {
          font-size: 2.5rem;
          font-weight: 800;
          color: var(--color-primary);
        }
        .plan-price small {
          font-size: 1rem;
          font-weight: 400;
          color: var(--color-text-muted);
        }
        .plan-features {
          list-style: none;
          margin: 0 0 var(--space-8);
          padding: 0;
        }
        .plan-features li {
          padding: var(--space-2) 0;
          color: var(--color-text);
        }
        .plan .btn {
          width: 100%;
          text-align: center;
        }
      `}</style>
    </>
  );
}

function Feature({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="feature">
      <div className="feature-emoji">{emoji}</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
