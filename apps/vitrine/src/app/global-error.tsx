'use client';

/**
 * Error boundary racine — attrape les crashes du root layout lui-même
 * (ex: club non résolu via le host, API injoignable). Sans ce fichier,
 * un throw dans le layout produit une page 100% blanche (body vide).
 *
 * Remplace tout le document : doit rendre ses propres <html>/<body>.
 * Les styles sont inline car globals.css (importé par le layout) n'est
 * pas garanti ici.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: 16,
          padding: 24,
          background: '#0a0908',
          color: '#f5f1e8',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <p
          style={{
            fontSize: 12,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: '#8a8276',
            margin: 0,
          }}
        >
          Erreur
        </p>
        <h1 style={{ fontWeight: 400, margin: 0 }}>
          Le site est momentanément indisponible
        </h1>
        <p style={{ maxWidth: 420, color: '#8a8276', margin: 0 }}>
          Une erreur est survenue lors du chargement du site du club.
          Réessayez dans quelques instants.
        </p>
        <button
          onClick={() => reset()}
          style={{
            marginTop: 8,
            background: 'none',
            border: '1px solid #c9a96a',
            color: '#c9a96a',
            padding: '10px 24px',
            cursor: 'pointer',
            fontSize: 13,
            letterSpacing: '0.1em',
          }}
        >
          Réessayer
        </button>
      </body>
    </html>
  );
}
