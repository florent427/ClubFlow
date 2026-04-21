import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CLUB_VITRINE_ARTICLES,
  SET_VITRINE_ARTICLE_STATUS,
  UPDATE_VITRINE_ARTICLE,
  type AdminVitrineArticle,
  type ClubVitrineArticlesData,
} from '../../lib/vitrine-documents';
import { getClubId, getToken } from '../../lib/storage';
import { useToast } from '../../components/ToastProvider';
import { AiArticleGeneratorModal } from '../../components/AiArticleGeneratorModal';
import type { AiArticleDraft } from '../../lib/ai-documents';

function apiBase(): string {
  return (
    (import.meta.env as Record<string, string | undefined>)
      .VITE_GRAPHQL_HTTP?.replace(/\/graphql.*$/, '') ?? 'http://localhost:3000'
  );
}

/**
 * Éditeur d'article vitrine.
 *
 * UX : titre + accroche + image de couverture (upload via MediaAssets) +
 * corps sous forme de paragraphes indépendants (ajout/suppression/réorg).
 *
 * Sauvegarde globale via `updateVitrineArticle` (le corps JSON est un
 * tableau de strings → facile à afficher côté vitrine).
 */
export function VitrineArticleEditor() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const { data, loading, error } = useQuery<ClubVitrineArticlesData>(
    CLUB_VITRINE_ARTICLES,
    { fetchPolicy: 'cache-and-network' },
  );

  const article = useMemo<AdminVitrineArticle | null>(() => {
    return (data?.clubVitrineArticles ?? []).find((a) => a.id === id) ?? null;
  }, [data, id]);

  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [coverImageId, setCoverImageId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiSeoMeta, setAiSeoMeta] = useState<{
    seoTitle: string;
    seoDescription: string;
    keywords: string[];
    h1: string;
    slug: string;
    faq: Array<{ question: string; answer: string }>;
  } | null>(null);

  function applyAiDraft(draft: AiArticleDraft): void {
    setTitle(draft.title);
    setExcerpt(draft.excerpt);
    // Flatten sections → paragraphs avec marqueurs H2 et images
    const paras: string[] = [];
    draft.sections.forEach((section) => {
      if (section.h2) paras.push(`## ${section.h2}`);
      section.paragraphs.forEach((p) => paras.push(p));
      if (section.inlineImageUrl) {
        paras.push(
          `![${section.inlineImageAlt ?? ''}](${section.inlineImageUrl})`,
        );
      }
    });
    if (draft.faq.length > 0) {
      paras.push('## FAQ');
      draft.faq.forEach(({ question, answer }) => {
        paras.push(`**${question}**`);
        paras.push(answer);
      });
    }
    setParagraphs(paras);
    if (draft.featuredImageAssetId && draft.featuredImageUrl) {
      setCoverImageId(draft.featuredImageAssetId);
      setCoverImageUrl(draft.featuredImageUrl);
    }
    setAiSeoMeta({
      seoTitle: draft.seoTitle,
      seoDescription: draft.seoDescription,
      keywords: draft.keywords,
      h1: draft.h1,
      slug: draft.slug,
      faq: draft.faq,
    });
  }

  const [update, { loading: saving }] = useMutation(UPDATE_VITRINE_ARTICLE, {
    refetchQueries: [{ query: CLUB_VITRINE_ARTICLES }],
  });
  const [setStatus, { loading: statusSaving }] = useMutation(
    SET_VITRINE_ARTICLE_STATUS,
    { refetchQueries: [{ query: CLUB_VITRINE_ARTICLES }] },
  );

  useEffect(() => {
    if (!article) return;
    setTitle(article.title);
    setExcerpt(article.excerpt ?? '');
    setCoverImageUrl(article.coverImageUrl);
    // On ne récupère pas directement bodyJson depuis la liste — il faut
    // refaire une query dédiée en Phase 2. Pour Phase 1, si body est connu
    // via `coverImageUrl` only, on laisse vide et on refait load.
    // Workaround : on lit bodyJson via une fetch GraphQL ponctuelle.
    void loadBody(article.id).then(setParagraphs).catch(() => {
      setParagraphs([]);
    });
  }, [article]);

  async function loadBody(articleId: string): Promise<string[]> {
    const token = getToken();
    const clubId = getClubId();
    if (!token || !clubId) return [];
    const res = await fetch(`${apiBase()}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Club-Id': clubId,
      },
      body: JSON.stringify({
        query: `query ArticleBody { clubVitrineArticles { id bodyJson } }`,
      }),
    });
    const json = (await res.json()) as {
      data?: {
        clubVitrineArticles: Array<{ id: string; bodyJson: string }>;
      };
    };
    const row = json.data?.clubVitrineArticles.find((a) => a.id === articleId);
    if (!row) return [];
    try {
      const parsed = JSON.parse(row.bodyJson) as unknown;
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }

  async function handleUploadCover(
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    const token = getToken();
    const clubId = getClubId();
    if (!token || !clubId) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${apiBase()}/media/upload?kind=image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Club-Id': clubId,
        },
        body: form,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const asset = (await res.json()) as { id: string; publicUrl: string };
      setCoverImageId(asset.id);
      setCoverImageUrl(asset.publicUrl);
      showToast('Image uploadée.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    } finally {
      setUploading(false);
    }
  }

  function movePara(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= paragraphs.length) return;
    const next = [...paragraphs];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setParagraphs(next);
  }

  async function save(): Promise<void> {
    if (!article) return;
    try {
      await update({
        variables: {
          input: {
            id: article.id,
            title,
            excerpt: excerpt || null,
            bodyJson: JSON.stringify(paragraphs),
            coverImageId: coverImageId ?? undefined,
          },
        },
      });
      showToast('Article enregistré.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  async function togglePublish(): Promise<void> {
    if (!article) return;
    const next = article.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    try {
      await setStatus({ variables: { input: { id: article.id, status: next } } });
      showToast(
        next === 'PUBLISHED' ? 'Article publié.' : 'Retour en brouillon.',
        'success',
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  if (loading && !article) return <p className="muted">Chargement…</p>;
  if (error) return <p className="form-error">{error.message}</p>;
  if (!article) {
    return (
      <p className="muted">
        Article introuvable.{' '}
        <Link to="/vitrine/articles">Retour à la liste</Link>
      </p>
    );
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">
              <Link to="/vitrine/articles">← Articles</Link>
            </p>
            <h1 className="members-loom__title">
              {article.title}{' '}
              <small style={{ fontSize: 14, color: 'var(--text-soft, #888)' }}>
                ({article.status})
              </small>
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-tight btn-ghost"
              onClick={() => setAiModalOpen(true)}
              title="Générer le contenu + les images à partir d'un texte source"
            >
              ✨ Générer avec IA
            </button>
            <button
              type="button"
              className="btn btn-tight"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              type="button"
              className={`btn btn-tight ${
                article.status === 'PUBLISHED' ? 'btn-ghost' : 'btn-primary'
              }`}
              onClick={() => void togglePublish()}
              disabled={statusSaving}
            >
              {article.status === 'PUBLISHED' ? 'Dépublier' : 'Publier'}
            </button>
          </div>
        </div>
      </header>

      <AiArticleGeneratorModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onDraftReady={applyAiDraft}
      />

      <div style={{ display: 'grid', gap: 24, maxWidth: 860 }}>
        {aiSeoMeta ? (
          <section
            style={{
              border: '1px solid var(--accent, #c9a96a)',
              borderRadius: 8,
              padding: 16,
              background:
                'color-mix(in oklab, var(--accent, #c9a96a) 6%, transparent)',
            }}
          >
            <h3 style={{ marginTop: 0 }}>SEO généré par IA</h3>
            <dl style={{ display: 'grid', gap: 10, margin: 0, fontSize: 13 }}>
              <div>
                <dt style={{ fontWeight: 600 }}>seoTitle ({aiSeoMeta.seoTitle.length} chars)</dt>
                <dd style={{ margin: '2px 0', fontFamily: 'monospace' }}>
                  {aiSeoMeta.seoTitle}
                </dd>
              </div>
              <div>
                <dt style={{ fontWeight: 600 }}>
                  seoDescription ({aiSeoMeta.seoDescription.length} chars)
                </dt>
                <dd style={{ margin: '2px 0', fontFamily: 'monospace' }}>
                  {aiSeoMeta.seoDescription}
                </dd>
              </div>
              <div>
                <dt style={{ fontWeight: 600 }}>H1</dt>
                <dd style={{ margin: '2px 0', fontFamily: 'monospace' }}>
                  {aiSeoMeta.h1}
                </dd>
              </div>
              <div>
                <dt style={{ fontWeight: 600 }}>Slug suggéré</dt>
                <dd style={{ margin: '2px 0', fontFamily: 'monospace' }}>
                  {aiSeoMeta.slug}
                </dd>
              </div>
              <div>
                <dt style={{ fontWeight: 600 }}>
                  Mots-clés ({aiSeoMeta.keywords.length})
                </dt>
                <dd style={{ margin: '2px 0' }}>
                  {aiSeoMeta.keywords.map((k) => (
                    <span
                      key={k}
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        margin: '2px 4px 2px 0',
                        borderRadius: 12,
                        background: 'rgba(0,0,0,0.06)',
                        fontSize: 12,
                      }}
                    >
                      {k}
                    </span>
                  ))}
                </dd>
              </div>
              {aiSeoMeta.faq.length > 0 ? (
                <div>
                  <dt style={{ fontWeight: 600 }}>
                    FAQ ({aiSeoMeta.faq.length})
                  </dt>
                  <dd style={{ margin: '2px 0' }}>
                    {aiSeoMeta.faq.map((q, i) => (
                      <div key={i} style={{ marginTop: 4, fontSize: 12 }}>
                        <strong>Q{i + 1}.</strong> {q.question}
                      </div>
                    ))}
                  </dd>
                </div>
              ) : null}
            </dl>
            <p
              className="muted"
              style={{ marginTop: 12, fontSize: 12, fontStyle: 'italic' }}
            >
              Ces métadonnées sont affichées à titre indicatif — elles seront
              persistées automatiquement en Phase 2 (champs SEO dédiés sur
              VitrineArticle).
            </p>
          </section>
        ) : null}

        <label className="field">
          <span>Titre</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={saving}
          />
        </label>
        <label className="field">
          <span>Accroche (excerpt)</span>
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            disabled={saving}
            rows={2}
            maxLength={500}
          />
        </label>

        <section
          style={{
            border: '1px solid var(--border, #ddd)',
            borderRadius: 8,
            padding: 16,
          }}
        >
          <h3 style={{ marginTop: 0 }}>Image de couverture</h3>
          {coverImageUrl ? (
            <img
              src={coverImageUrl}
              alt=""
              style={{
                maxWidth: 400,
                maxHeight: 240,
                objectFit: 'cover',
                border: '1px solid var(--border, #ddd)',
              }}
            />
          ) : (
            <p className="muted">Aucune image.</p>
          )}
          <div style={{ marginTop: 10 }}>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => void handleUploadCover(e)}
              disabled={uploading}
            />
            {uploading ? <span className="muted"> Envoi…</span> : null}
            {coverImageUrl ? (
              <button
                type="button"
                className="btn btn-tight btn-ghost"
                style={{ marginLeft: 12 }}
                onClick={() => {
                  setCoverImageId(null);
                  setCoverImageUrl(null);
                }}
              >
                Retirer
              </button>
            ) : null}
          </div>
        </section>

        <section>
          <h3>Paragraphes ({paragraphs.length})</h3>
          {paragraphs.length === 0 ? (
            <p className="muted">
              Aucun paragraphe. Cliquez sur « Ajouter un paragraphe » ci-dessous.
            </p>
          ) : (
            paragraphs.map((para, i) => (
              <div
                key={i}
                style={{
                  border: '1px solid var(--border, #ddd)',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <textarea
                  value={para}
                  onChange={(e) => {
                    const next = [...paragraphs];
                    next[i] = e.target.value;
                    setParagraphs(next);
                  }}
                  rows={4}
                  style={{ width: '100%' }}
                  placeholder={`Paragraphe ${i + 1}`}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button
                    type="button"
                    className="btn btn-tight btn-ghost"
                    disabled={i === 0}
                    onClick={() => movePara(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-tight btn-ghost"
                    disabled={i === paragraphs.length - 1}
                    onClick={() => movePara(i, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn-tight btn-ghost"
                    style={{ marginLeft: 'auto' }}
                    onClick={() =>
                      setParagraphs(paragraphs.filter((_, idx) => idx !== i))
                    }
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))
          )}
          <button
            type="button"
            className="btn btn-tight"
            onClick={() => setParagraphs([...paragraphs, ''])}
          >
            + Ajouter un paragraphe
          </button>
        </section>
      </div>
    </>
  );
}
