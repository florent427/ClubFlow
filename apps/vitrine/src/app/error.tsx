'use client';

/**
 * Error boundary des pages vitrine — rendu à l'intérieur du layout.
 * Attrape les erreurs SSR/rendu des pages pour afficher un message
 * propre en français au lieu d'une page vide.
 */
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section
      style={{
        minHeight: '55vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '120px 24px 80px',
        gap: 16,
      }}
    >
      <p
        style={{
          fontSize: 12,
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
        }}
      >
        Erreur
      </p>
      <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 400 }}>
        Une erreur est survenue
      </h1>
      <p style={{ maxWidth: 420, color: 'var(--muted)' }}>
        Le contenu n&rsquo;a pas pu être chargé. Réessayez dans quelques
        instants.
      </p>
      <button
        onClick={() => reset()}
        style={{
          marginTop: 8,
          background: 'none',
          border: '1px solid var(--accent)',
          color: 'var(--accent)',
          padding: '10px 24px',
          cursor: 'pointer',
          fontSize: 13,
          letterSpacing: '0.1em',
        }}
      >
        Réessayer
      </button>
    </section>
  );
}
