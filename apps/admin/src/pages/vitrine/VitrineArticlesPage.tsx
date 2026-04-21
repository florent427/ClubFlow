import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CLUB_VITRINE_ARTICLES,
  CREATE_VITRINE_ARTICLE,
  DELETE_VITRINE_ARTICLE,
  SET_VITRINE_ARTICLE_STATUS,
  type ClubVitrineArticlesData,
} from '../../lib/vitrine-documents';
import { useToast } from '../../components/ToastProvider';

/**
 * Liste + création/suppression simples d'articles vitrine.
 *
 * Phase 1 : formulaire brut (titre + excerpt + body JSON). Phase 2 : éditeur
 * rich-text Tiptap avec images inline.
 */
export function VitrineArticlesPage() {
  const { showToast } = useToast();
  const { data, loading, error } = useQuery<ClubVitrineArticlesData>(
    CLUB_VITRINE_ARTICLES,
    { fetchPolicy: 'cache-and-network' },
  );
  const [createArticle, { loading: creating }] = useMutation(
    CREATE_VITRINE_ARTICLE,
    { refetchQueries: [{ query: CLUB_VITRINE_ARTICLES }] },
  );
  const [setStatus] = useMutation(SET_VITRINE_ARTICLE_STATUS, {
    refetchQueries: [{ query: CLUB_VITRINE_ARTICLES }],
  });
  const [deleteArticle] = useMutation(DELETE_VITRINE_ARTICLE, {
    refetchQueries: [{ query: CLUB_VITRINE_ARTICLES }],
  });

  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody] = useState('');

  async function handleCreate(): Promise<void> {
    if (!title.trim()) {
      showToast('Titre requis', 'error');
      return;
    }
    const paragraphs = body
      .split('\n\n')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    try {
      await createArticle({
        variables: {
          input: {
            title: title.trim(),
            excerpt: excerpt.trim() || null,
            bodyJson: JSON.stringify(paragraphs),
            publishNow: false,
          },
        },
      });
      setTitle('');
      setExcerpt('');
      setBody('');
      showToast('Article créé (brouillon).', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  const articles = data?.clubVitrineArticles ?? [];

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">
              <Link to="/vitrine">← Site vitrine</Link>
            </p>
            <h1 className="members-loom__title">
              Articles ({articles.length})
            </h1>
          </div>
        </div>
      </header>

      <section
        style={{
          border: '1px solid var(--border, #ddd)',
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Nouvel article</h2>
        <label className="field">
          <span>Titre</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Accroche (excerpt)</span>
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            rows={2}
          />
        </label>
        <label className="field">
          <span>Corps (paragraphes séparés par une ligne vide)</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
          />
        </label>
        <button
          type="button"
          className="btn btn-tight"
          disabled={creating}
          onClick={() => void handleCreate()}
        >
          {creating ? 'Création…' : 'Créer en brouillon'}
        </button>
      </section>

      {error ? (
        <p className="form-error">{error.message}</p>
      ) : loading && articles.length === 0 ? (
        <p className="muted">Chargement…</p>
      ) : articles.length === 0 ? (
        <p className="muted">Aucun article pour le moment.</p>
      ) : (
        <div className="members-table-wrap">
          <table className="members-table">
            <thead>
              <tr>
                <th>Titre</th>
                <th>Slug</th>
                <th>Statut</th>
                <th>Publié le</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to={`/vitrine/articles/${a.id}`}>
                      <strong>{a.title}</strong>
                    </Link>
                    {a.excerpt ? (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {a.excerpt}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <code>/actualites/{a.slug}</code>
                  </td>
                  <td>{a.status}</td>
                  <td className="muted">
                    {a.publishedAt
                      ? new Date(a.publishedAt).toLocaleDateString('fr-FR')
                      : '—'}
                  </td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {a.status !== 'PUBLISHED' ? (
                      <button
                        type="button"
                        className="btn btn-tight"
                        onClick={() =>
                          void setStatus({
                            variables: {
                              input: { id: a.id, status: 'PUBLISHED' },
                            },
                          })
                        }
                      >
                        Publier
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-tight btn-ghost"
                        onClick={() =>
                          void setStatus({
                            variables: {
                              input: { id: a.id, status: 'DRAFT' },
                            },
                          })
                        }
                      >
                        Dépublier
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-tight btn-ghost"
                      onClick={() => {
                        if (
                          window.confirm(`Supprimer "${a.title}" ?`)
                        ) {
                          void deleteArticle({ variables: { id: a.id } });
                        }
                      }}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
