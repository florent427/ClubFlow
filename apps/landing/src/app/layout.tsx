import '@/styles/globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: {
    default: 'ClubFlow — La plateforme tout-en-un pour gérer votre club',
    template: '%s · ClubFlow',
  },
  description:
    'ClubFlow simplifie la gestion de votre club sportif ou associatif : adhésions, planning, communication, comptabilité, vitrine web. Hébergé en France, RGPD.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand">
              ClubFlow
            </Link>
            <nav className="nav">
              <Link href="/#features">Fonctionnalités</Link>
              <Link href="/#pricing">Tarifs</Link>
              <Link href="/login" className="btn btn-secondary">
                Connexion
              </Link>
              <Link href="/signup" className="btn btn-primary">
                Créer mon club
              </Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="container">
            <p className="muted">
              © {new Date().getFullYear()} ClubFlow — Hébergé en France 🇫🇷 ·
              RGPD · <Link href="/mentions-legales">Mentions légales</Link>
            </p>
          </div>
        </footer>
        <style>{`
          .site-header {
            border-bottom: 1px solid var(--color-border);
            background: var(--color-bg);
            position: sticky;
            top: 0;
            z-index: 10;
          }
          .header-inner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-top: var(--space-4);
            padding-bottom: var(--space-4);
          }
          .brand {
            font-size: 1.5rem;
            font-weight: 800;
            color: var(--color-primary);
            letter-spacing: -0.02em;
          }
          .brand:hover { text-decoration: none; }
          .nav {
            display: flex;
            align-items: center;
            gap: var(--space-6);
          }
          .nav a:not(.btn) {
            color: var(--color-text-muted);
          }
          .nav a:not(.btn):hover {
            color: var(--color-text);
            text-decoration: none;
          }
          .site-footer {
            border-top: 1px solid var(--color-border);
            padding: var(--space-12) 0;
            margin-top: var(--space-24);
          }
          @media (max-width: 640px) {
            .nav { gap: var(--space-3); font-size: 0.9rem; }
            .nav a:not(.btn) { display: none; }
          }
        `}</style>
      </body>
    </html>
  );
}
