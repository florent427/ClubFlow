import type { Metadata } from 'next';
import { SignupForm } from './SignupForm';

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
        <p className="muted lede">
          Inscription auto-service en moins de 2 minutes — sans CB, sans
          engagement.
        </p>
        <SignupForm />
      </div>

      <style>{`
        .signup {
          padding: var(--space-16) var(--space-6);
          max-width: 640px;
        }
        .signup-card {
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-8);
        }
        .signup-card h1 {
          font-size: 2rem;
          margin-bottom: var(--space-2);
        }
        .signup .lede {
          margin-bottom: var(--space-8);
        }
      `}</style>
    </section>
  );
}
