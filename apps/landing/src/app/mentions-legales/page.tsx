import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mentions légales',
};

export default function LegalPage() {
  return (
    <section className="legal container">
      <h1>Mentions légales</h1>

      <h2>Éditeur</h2>
      <p>
        ClubFlow est édité par Florent Morel — auto-entrepreneur, France.
        Contact : <a href="mailto:florent.morel427@gmail.com">florent.morel427@gmail.com</a>.
      </p>

      <h2>Hébergement</h2>
      <p>
        Hetzner Online GmbH — Industriestr. 25, 91710 Gunzenhausen, Allemagne (datacenter Helsinki, EU).
      </p>

      <h2>Données personnelles (RGPD)</h2>
      <p>
        ClubFlow stocke vos données dans l'Union Européenne. Aucun transfert
        hors EU. Pour exercer vos droits RGPD (accès, rectification, suppression),
        contactez le responsable de traitement à l'adresse ci-dessus.
      </p>

      <h2>Cookies</h2>
      <p>
        ClubFlow n'utilise aucun cookie de tracking ou publicitaire. Seuls des
        cookies techniques de session (authentification) sont déposés sur
        l'admin et le portail membre.
      </p>

      <style>{`
        .legal {
          padding: var(--space-16) var(--space-6);
          max-width: 720px;
        }
        .legal h1 { margin-bottom: var(--space-8); }
        .legal h2 {
          font-size: 1.25rem;
          margin-top: var(--space-8);
          margin-bottom: var(--space-3);
        }
        .legal p { margin-bottom: var(--space-3); }
      `}</style>
    </section>
  );
}
