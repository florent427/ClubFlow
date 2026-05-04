import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Créer votre club',
  description:
    'Créez votre espace ClubFlow gratuitement en moins de 2 minutes.',
};

export default function SignupPage() {
  return (
    <section className="signup container">
      <div className="signup-card">
        <h1>Créer votre club</h1>
        <p className="muted">
          Inscription auto-service en moins de 2 minutes — sans CB, sans engagement.
        </p>

        <div className="placeholder">
          <p>
            🚧 <strong>Inscription self-service en cours de finalisation.</strong>
          </p>
          <p>
            Pour démarrer dès aujourd'hui, contactez-nous à{' '}
            <a href="mailto:florent.morel427@gmail.com">
              florent.morel427@gmail.com
            </a>
            {' '}— votre club sera créé manuellement sous 24h.
          </p>
          <p>
            <Link href="/" className="btn btn-secondary" style={{ marginTop: '1rem' }}>
              Retour à l'accueil
            </Link>
          </p>
        </div>
      </div>

      <style>{`
        .signup {
          padding: var(--space-16) var(--space-6);
          max-width: 560px;
        }
        .signup-card {
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-8);
        }
        .signup-card h1 {
          font-size: 2rem;
          margin-bottom: var(--space-3);
        }
        .placeholder {
          margin-top: var(--space-8);
          padding: var(--space-6);
          background: var(--color-bg);
          border-radius: var(--radius);
          border-left: 3px solid var(--color-primary);
        }
        .placeholder p {
          color: var(--color-text);
          margin-bottom: var(--space-3);
        }
        .placeholder p:last-child {
          margin-bottom: 0;
        }
      `}</style>
    </section>
  );
}
