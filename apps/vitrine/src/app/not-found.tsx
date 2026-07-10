import Link from 'next/link';

/**
 * 404 vitrine — rendu à l'intérieur du layout (header/footer du club
 * conservés). Sans ce fichier, Next.js sert son 404 par défaut, voire
 * une page vide si l'erreur survient pendant le streaming SSR.
 */
export default function NotFound() {
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
        Erreur 404
      </p>
      <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 400 }}>
        Page introuvable
      </h1>
      <p style={{ maxWidth: 420, color: 'var(--muted)' }}>
        Cette page n&rsquo;existe pas ou n&rsquo;est pas encore publiée.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 8,
          color: 'var(--accent)',
          textDecoration: 'none',
          borderBottom: '1px solid var(--accent)',
          paddingBottom: 2,
        }}
      >
        Retour à l&rsquo;accueil
      </Link>
    </section>
  );
}
