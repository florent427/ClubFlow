import { useMutation, useQuery } from '@apollo/client/react';
import { Link } from 'react-router-dom';
import {
  CLUB_VITRINE_PAGES,
  SET_VITRINE_PAGE_STATUS,
  type ClubVitrinePagesData,
} from '../../lib/vitrine-documents';
import { useToast } from '../../components/ToastProvider';
import { OpenEditModeButton } from './OpenEditModeButton';

const PAGE_LABELS: Record<string, string> = {
  index: 'Accueil',
  club: 'Le Club',
  cours: 'Cours',
  dojo: 'Dojo',
  tarifs: 'Tarifs',
  equipe: 'Équipe',
  galerie: 'Galerie',
  actualites: 'Actualités',
  competitions: 'Compétitions',
  contact: 'Contact',
};

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function VitrineHomePage() {
  const { showToast } = useToast();
  const { data, loading, error, refetch } = useQuery<ClubVitrinePagesData>(
    CLUB_VITRINE_PAGES,
    { fetchPolicy: 'cache-and-network' },
  );
  const [setStatus, { loading: saving }] = useMutation(
    SET_VITRINE_PAGE_STATUS,
    {
      refetchQueries: [{ query: CLUB_VITRINE_PAGES }],
    },
  );

  const vitrineUrl =
    (import.meta.env as Record<string, string | undefined>)
      .VITE_VITRINE_URL ?? 'http://localhost:5175';

  async function toggleStatus(
    pageId: string,
    currentStatus: 'DRAFT' | 'PUBLISHED',
  ): Promise<void> {
    const next = currentStatus === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    try {
      await setStatus({
        variables: { input: { pageId, status: next } },
      });
      showToast(
        next === 'PUBLISHED' ? 'Page publiée.' : 'Page passée en brouillon.',
        'success',
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de mise à jour',
        'error',
      );
    }
  }

  const pages = data?.clubVitrinePages ?? [];

  return (
    <>
      <header className="members-loom__hero">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">Site vitrine</p>
            <h1 className="members-loom__title">Pages ({pages.length})</h1>
            <p className="muted">
              Éditez les pages publiques de votre site. Les modifications sont
              en ligne sous quelques secondes.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <a
              href={vitrineUrl}
              target="_blank"
              rel="noopener"
              className="btn btn-ghost"
            >
              Ouvrir le site public ↗
            </a>
            <OpenEditModeButton redirect="/" className="btn btn-primary">
              Éditer sur le site ↗
            </OpenEditModeButton>
            <Link to="/vitrine/settings" className="btn btn-ghost">
              Paramètres
            </Link>
          </div>
        </div>
      </header>

      {error ? (
        <p className="form-error" role="alert">
          {error.message}
        </p>
      ) : loading && pages.length === 0 ? (
        <p className="muted">Chargement…</p>
      ) : pages.length === 0 ? (
        <p className="muted">
          Aucune page vitrine. Lancez le seed :
          <code> npx tsx prisma/seed-vitrine.ts</code>
        </p>
      ) : (
        <div className="members-table-wrap">
          <table className="members-table">
            <thead>
              <tr>
                <th>Page</th>
                <th>Slug</th>
                <th>Statut</th>
                <th>Modifiée</th>
                <th>SEO</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{PAGE_LABELS[p.slug] ?? p.slug}</strong>
                  </td>
                  <td>
                    <code>/{p.slug === 'index' ? '' : p.slug}</code>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`btn btn-tight ${
                        p.status === 'PUBLISHED'
                          ? 'btn-solid'
                          : 'btn-ghost'
                      }`}
                      disabled={saving}
                      onClick={() => void toggleStatus(p.id, p.status)}
                      title={
                        p.status === 'PUBLISHED'
                          ? 'Cliquez pour dépublier'
                          : 'Cliquez pour publier'
                      }
                    >
                      {p.status === 'PUBLISHED' ? 'Publiée' : 'Brouillon'}
                    </button>
                  </td>
                  <td className="muted">{formatUpdatedAt(p.updatedAt)}</td>
                  <td>
                    {p.seoTitle ? (
                      <span title={p.seoTitle}>✓</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <Link to={`/vitrine/pages/${p.slug}`} className="btn btn-tight">
                      Modifier (JSON)
                    </Link>
                    <OpenEditModeButton
                      redirect={p.slug === 'index' ? '/' : `/${p.slug}`}
                      className="btn btn-tight"
                    >
                      Éditer en ligne ↗
                    </OpenEditModeButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section style={{ marginTop: 48 }}>
        <h2 className="members-loom__title" style={{ fontSize: 24 }}>
          Contenus dynamiques
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
            marginTop: 16,
          }}
        >
          <Link
            to="/vitrine/articles?channel=NEWS"
            className="card-link"
          >
            <h3>Actualités</h3>
            <p className="muted">
              Brèves publiées sur <code>/actualites</code>. Même éditeur,
              même SEO, même génération IA que le Blog — juste un canal
              différent.
            </p>
          </Link>
          <Link
            to="/vitrine/articles?channel=BLOG"
            className="card-link"
          >
            <h3>Blog</h3>
            <p className="muted">
              Articles de fond publiés sur <code>/blog</code>. Basculables
              vers Actualités et inversement sans perte.
            </p>
          </Link>
          <Link to="/vitrine/categories" className="card-link">
            <h3>Catégories</h3>
            <p className="muted">
              Organise tes contenus par thème (s'applique aux actualités
              et au blog).
            </p>
          </Link>
          <Link to="/vitrine/commentaires" className="card-link">
            <h3>Commentaires</h3>
            <p className="muted">Modération IA + validation manuelle.</p>
          </Link>
          <Link to="/vitrine/galerie" className="card-link">
            <h3>Galerie</h3>
            <p className="muted">Photos du club.</p>
          </Link>
          <Link to="/vitrine/medias" className="card-link">
            <h3>Bibliothèque média</h3>
            <p className="muted">Images et documents uploadés.</p>
          </Link>
          <Link to="/vitrine/branding" className="card-link">
            <h3>Branding</h3>
            <p className="muted">Tagline, footer, réseaux sociaux.</p>
          </Link>
        </div>
      </section>

      <button
        type="button"
        className="btn btn-tight btn-ghost"
        style={{ marginTop: 24 }}
        onClick={() => void refetch()}
      >
        Actualiser
      </button>
    </>
  );
}
