import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CLUB_VITRINE_ARTICLES,
  CLUB_VITRINE_CATEGORIES,
  SET_VITRINE_ARTICLE_CATEGORIES,
  SET_VITRINE_ARTICLE_STATUS,
  UPDATE_VITRINE_ARTICLE,
  type AdminVitrineArticle,
  type ClubVitrineArticlesData,
  type ClubVitrineCategoriesData,
  type UpdateVitrineArticleData,
  type VitrineArticleFaqItem,
} from '../../lib/vitrine-documents';
import { getClubId, getToken } from '../../lib/storage';
import { useToast } from '../../components/ToastProvider';
import { TiptapEditor } from '../../components/editor/TiptapEditor';

function apiBase(): string {
  return (
    (import.meta.env as Record<string, string | undefined>)
      .VITE_GRAPHQL_HTTP?.replace(/\/graphql.*$/, '') ?? 'http://localhost:3000'
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

/** Normalise bodyJson DB vers HTML éditable. */
function bodyJsonToHtml(bodyJsonRaw: string | null | undefined): string {
  if (!bodyJsonRaw) return '<p></p>';
  try {
    const parsed = JSON.parse(bodyJsonRaw) as unknown;
    // Nouveau format : { format: 'html', html: '...' }
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      (parsed as Record<string, unknown>).format === 'html' &&
      typeof (parsed as Record<string, unknown>).html === 'string'
    ) {
      return (parsed as { html: string }).html || '<p></p>';
    }
    // Ancien format : tableau de paragraphes (avec éventuellement marqueurs `## h2` et `![alt](url)`)
    if (Array.isArray(parsed)) {
      const parts: string[] = [];
      for (const raw of parsed) {
        if (typeof raw !== 'string') continue;
        const t = raw.trim();
        if (!t) continue;
        if (t.startsWith('## ')) {
          parts.push(`<h2>${escapeHtml(t.slice(3))}</h2>`);
        } else if (t.startsWith('# ')) {
          parts.push(`<h1>${escapeHtml(t.slice(2))}</h1>`);
        } else {
          const m = /^!\[(.*?)\]\((.+)\)$/.exec(t);
          if (m) {
            parts.push(
              `<p><img src="${escapeAttr(m[2]!)}" alt="${escapeHtml(m[1] ?? '')}" /></p>`,
            );
          } else if (t.startsWith('**') && t.endsWith('**')) {
            parts.push(`<p><strong>${escapeHtml(t.slice(2, -2))}</strong></p>`);
          } else {
            parts.push(`<p>${escapeHtml(t)}</p>`);
          }
        }
      }
      return parts.join('\n') || '<p></p>';
    }
  } catch {
    /* ignore */
  }
  return '<p></p>';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}

/**
 * Éditeur d'article vitrine — V2 complet.
 *
 * Composé de :
 * - Topbar : titre inline, bouton enregistrer, bouton publier/dépublier
 * - Zone principale : image de couverture + alt + éditeur Tiptap riche
 * - Panneau latéral SEO : title/description avec preview Google, slug,
 *   mots-clés, H1, canonical, noindex, image OG, FAQ.
 */
export function VitrineArticleEditor() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const { data, loading, error, refetch, startPolling, stopPolling } =
    useQuery<ClubVitrineArticlesData>(CLUB_VITRINE_ARTICLES, {
      fetchPolicy: 'cache-and-network',
    });
  const article = useMemo<AdminVitrineArticle | null>(() => {
    return (data?.clubVitrineArticles ?? []).find((a) => a.id === id) ?? null;
  }, [data, id]);

  // Polling pendant la génération IA en arrière-plan (PENDING) — refresh
  // toutes les 2s pour que l'utilisateur voit la progression en live.
  useEffect(() => {
    if (article?.generationStatus === 'PENDING') {
      startPolling(2000);
      return () => stopPolling();
    }
    stopPolling();
  }, [article?.generationStatus, startPolling, stopPolling]);

  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [bodyHtml, setBodyHtml] = useState('<p></p>');
  const [slug, setSlug] = useState('');
  const [slugDirty, setSlugDirty] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [coverImageId, setCoverImageId] = useState<string | null>(null);
  const [coverImageAlt, setCoverImageAlt] = useState('');
  const [uploading, setUploading] = useState(false);

  // SEO
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [seoKeywords, setSeoKeywords] = useState<string[]>([]);
  const [seoKeywordInput, setSeoKeywordInput] = useState('');
  const [seoH1, setSeoH1] = useState('');
  const [seoCanonicalUrl, setSeoCanonicalUrl] = useState('');
  const [seoNoindex, setSeoNoindex] = useState(false);
  const [seoFaq, setSeoFaq] = useState<VitrineArticleFaqItem[]>([]);
  const [seoOgImageUrl, setSeoOgImageUrl] = useState<string | null>(null);
  const [seoOgImageId, setSeoOgImageId] = useState<string | null>(null);

  const [dirty, setDirty] = useState(false);
  const lastLoadedId = useRef<string | null>(null);

  const [update, { loading: saving }] = useMutation<UpdateVitrineArticleData>(
    UPDATE_VITRINE_ARTICLE,
    { refetchQueries: [{ query: CLUB_VITRINE_ARTICLES }] },
  );
  const [setArticleCategories] = useMutation(SET_VITRINE_ARTICLE_CATEGORIES, {
    refetchQueries: [
      { query: CLUB_VITRINE_ARTICLES },
      { query: CLUB_VITRINE_CATEGORIES },
    ],
  });
  const { data: categoriesData } = useQuery<ClubVitrineCategoriesData>(
    CLUB_VITRINE_CATEGORIES,
    { fetchPolicy: 'cache-and-network' },
  );
  const allCategories = categoriesData?.clubVitrineCategories ?? [];
  const [setStatus, { loading: statusSaving }] = useMutation(
    SET_VITRINE_ARTICLE_STATUS,
    { refetchQueries: [{ query: CLUB_VITRINE_ARTICLES }] },
  );

  // Hydrate depuis l'article chargé — seulement à la 1re fois ou changement d'id
  useEffect(() => {
    if (!article) return;
    if (lastLoadedId.current === article.id) return;
    lastLoadedId.current = article.id;
    setTitle(article.title);
    setExcerpt(article.excerpt ?? '');
    setSlug(article.slug);
    setSlugDirty(false);
    setBodyHtml(bodyJsonToHtml(article.bodyJson));
    setCoverImageUrl(article.coverImageUrl);
    setCoverImageId(article.coverImageId);
    setCoverImageAlt(article.coverImageAlt ?? '');
    setSeoTitle(article.seoTitle ?? '');
    setSeoDescription(article.seoDescription ?? '');
    setSeoKeywords(article.seoKeywords ?? []);
    setSeoH1(article.seoH1 ?? '');
    setSeoCanonicalUrl(article.seoCanonicalUrl ?? '');
    setSeoNoindex(article.seoNoindex ?? false);
    setSeoFaq(article.seoFaq ?? []);
    setSeoOgImageUrl(article.seoOgImageUrl);
    setSeoOgImageId(article.seoOgImageId);
    setDirty(false);
  }, [article]);

  // Auto-slug depuis le titre tant que l'utilisateur n'a pas édité le slug manuellement
  useEffect(() => {
    if (!slugDirty && title) setSlug(slugify(title));
  }, [title, slugDirty]);

  async function handleUploadImage(
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'cover' | 'og',
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
      if (target === 'cover') {
        setCoverImageId(asset.id);
        setCoverImageUrl(asset.publicUrl);
      } else {
        setSeoOgImageId(asset.id);
        setSeoOgImageUrl(asset.publicUrl);
      }
      setDirty(true);
      showToast('Image uploadée.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    } finally {
      setUploading(false);
    }
  }

  function markDirty<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setDirty(true);
    };
  }

  function addKeyword(): void {
    const v = seoKeywordInput.trim();
    if (!v) return;
    if (seoKeywords.includes(v)) {
      setSeoKeywordInput('');
      return;
    }
    setSeoKeywords([...seoKeywords, v]);
    setSeoKeywordInput('');
    setDirty(true);
  }

  function removeKeyword(k: string): void {
    setSeoKeywords(seoKeywords.filter((x) => x !== k));
    setDirty(true);
  }

  function addFaq(): void {
    setSeoFaq([...seoFaq, { question: '', answer: '' }]);
    setDirty(true);
  }

  function updateFaq(index: number, patch: Partial<VitrineArticleFaqItem>): void {
    const next = [...seoFaq];
    next[index] = { ...next[index]!, ...patch };
    setSeoFaq(next);
    setDirty(true);
  }

  function removeFaq(index: number): void {
    setSeoFaq(seoFaq.filter((_, i) => i !== index));
    setDirty(true);
  }

  async function save(): Promise<void> {
    if (!article) return;
    const bodyJson = JSON.stringify({ format: 'html', html: bodyHtml });
    try {
      await update({
        variables: {
          input: {
            id: article.id,
            title: title.trim() || 'Sans titre',
            slug: slug || undefined,
            excerpt: excerpt.trim() || null,
            bodyJson,
            coverImageId: coverImageId ?? undefined,
            coverImageAlt: coverImageAlt || null,
            seoTitle: seoTitle.trim() || null,
            seoDescription: seoDescription.trim() || null,
            seoKeywords,
            seoH1: seoH1.trim() || null,
            seoCanonicalUrl: seoCanonicalUrl.trim() || null,
            seoNoindex,
            seoFaqJson:
              seoFaq.filter((f) => f.question.trim() || f.answer.trim()).length >
              0
                ? JSON.stringify(
                    seoFaq.filter((f) => f.question.trim() || f.answer.trim()),
                  )
                : null,
            seoOgImageId: seoOgImageId ?? undefined,
          },
        },
      });
      await refetch();
      setDirty(false);
      showToast('Article enregistré.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  async function togglePublish(): Promise<void> {
    if (!article) return;
    // On enregistre d'abord si dirty
    if (dirty) await save();
    const next = article.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    try {
      await setStatus({
        variables: { input: { id: article.id, status: next } },
      });
      showToast(
        next === 'PUBLISHED' ? 'Article publié.' : 'Retour en brouillon.',
        'success',
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  if (loading && !article) return <p className="muted">Chargement\u2026</p>;
  if (error) return <p className="form-error">{error.message}</p>;
  if (!article) {
    return (
      <p className="muted">
        Article introuvable.{' '}
        <Link to="/vitrine/articles">Retour à la liste</Link>
      </p>
    );
  }

  // --- Vue d'attente : génération IA en cours ou échouée ---
  if (article.generationStatus === 'PENDING') {
    return (
      <>
        <header className="members-loom__hero members-loom__hero--nested">
          <div className="members-hero__actions">
            <div>
              <p className="members-loom__eyebrow">
                <Link to="/vitrine/articles">← Articles</Link>
              </p>
              <h1 className="members-loom__title" style={{ fontSize: 20 }}>
                Génération IA en cours…
              </h1>
            </div>
          </div>
        </header>
        <div className="pending-generation">
          <div className="pending-generation__icon">⏳</div>
          <p className="pending-generation__title">
            L'IA rédige ton article et crée les images…
          </p>
          <p className="pending-generation__subtitle">
            Cela prend généralement 30 à 90 secondes. Tu peux fermer cette page
            et revenir plus tard — la liste se met à jour automatiquement.
          </p>
          <div className="pending-generation__progress">
            {article.generationProgress ?? 'Initialisation…'}
          </div>
          <div style={{ marginTop: 18 }}>
            <Link to="/vitrine/articles" className="btn btn-tight btn-ghost">
              Retour à la liste
            </Link>
          </div>
        </div>
      </>
    );
  }
  if (article.generationStatus === 'FAILED') {
    return (
      <>
        <header className="members-loom__hero members-loom__hero--nested">
          <div className="members-hero__actions">
            <div>
              <p className="members-loom__eyebrow">
                <Link to="/vitrine/articles">← Articles</Link>
              </p>
              <h1 className="members-loom__title" style={{ fontSize: 20 }}>
                Génération IA échouée
              </h1>
            </div>
          </div>
        </header>
        <div className="pending-generation">
          <div style={{ fontSize: 36, marginBottom: 10 }}>✕</div>
          <p className="pending-generation__title">
            La génération n'a pas pu aboutir
          </p>
          <div className="pending-generation__failure">
            {article.generationError ?? 'Erreur inconnue'}
          </div>
          <div style={{ marginTop: 18 }}>
            <Link to="/vitrine/articles" className="btn btn-tight btn-ghost">
              Retour à la liste
            </Link>
          </div>
        </div>
      </>
    );
  }

  const seoTitleFinal = seoTitle || title;
  const seoDescriptionFinal = seoDescription || excerpt || '';
  const urlPreview = `mondojo.fr/actualites/${slug || 'slug-auto'}`;

  return (
    <>
      <div className="article-editor__stickybar">
        <header className="members-loom__hero members-loom__hero--nested">
          <div className="members-hero__actions">
            <div>
              <p className="members-loom__eyebrow">
                <Link to="/vitrine/articles">← Articles</Link>
              </p>
              <h1 className="members-loom__title" style={{ fontSize: 20 }}>
                {article.status === 'DRAFT' ? 'Brouillon' : 'Article publié'}
                {dirty ? (
                  <span
                    style={{
                      fontSize: 12,
                      color: '#b45309',
                      marginLeft: 10,
                      fontWeight: 500,
                    }}
                  >
                    Modifications non enregistrées
                  </span>
                ) : null}
              </h1>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-tight btn-ghost"
                onClick={() => navigate('/vitrine/articles')}
              >
                Retour
              </button>
              <button
                type="button"
                className="btn btn-tight"
                onClick={() => void save()}
                disabled={saving || !dirty}
              >
                {saving ? 'Enregistrement\u2026' : 'Enregistrer'}
              </button>
              <button
                type="button"
                className={`btn btn-tight ${
                  article.status === 'PUBLISHED' ? 'btn-ghost' : 'btn-primary'
                }`}
                onClick={() => void togglePublish()}
                disabled={statusSaving}
              >
                {article.status === 'PUBLISHED'
                  ? 'Dépublier'
                  : 'Enregistrer & publier'}
              </button>
            </div>
          </div>
        </header>
      </div>

      {/* Banner warnings IA : quand la génération s'est terminée avec des
          avertissements non-bloquants (ex. image featured qui n'a pas pu
          être générée et placeholder inséré à la place). */}
      {article.generationStatus === 'DONE' &&
      article.generationWarnings.length > 0 ? (
        <div className="ai-warnings-banner">
          <strong>
            Génération IA terminée avec {article.generationWarnings.length}{' '}
            avertissement(s)
          </strong>
          <ul>
            {article.generationWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="article-editor">
        {/* ========== Zone principale ========== */}
        <div className="article-editor__main">
          <section
            style={{
              background: '#fff',
              border: '1px solid var(--border, #e5e7eb)',
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <div className="seo-field">
              <label htmlFor="ed-title">Titre de l'article</label>
              <input
                id="ed-title"
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDirty(true);
                }}
                placeholder="Votre titre accrocheur\u2026"
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  padding: 10,
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                }}
              />
            </div>

            <div className="seo-field">
              <label htmlFor="ed-excerpt">Accroche (excerpt)</label>
              <textarea
                id="ed-excerpt"
                value={excerpt}
                onChange={(e) => {
                  setExcerpt(e.target.value);
                  setDirty(true);
                }}
                rows={2}
                maxLength={500}
                placeholder="Résumé affiché en liste et sur les réseaux sociaux\u2026"
              />
              <span className="seo-field__hint">
                <span>{excerpt.length}/500 — idéalement 150-200 chars</span>
              </span>
            </div>

            {/* Image de couverture */}
            <div
              style={{
                border: '1px dashed #cbd5e1',
                borderRadius: 10,
                padding: 14,
                marginTop: 14,
                background: '#f8fafc',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                  alignItems: 'center',
                }}
              >
                <strong style={{ fontSize: 13 }}>Image mise en avant</strong>
                {coverImageUrl ? (
                  <button
                    type="button"
                    className="btn btn-tight btn-ghost"
                    onClick={() => {
                      setCoverImageId(null);
                      setCoverImageUrl(null);
                      setDirty(true);
                    }}
                  >
                    Retirer
                  </button>
                ) : null}
              </div>
              {coverImageUrl ? (
                <img
                  src={coverImageUrl}
                  alt={coverImageAlt}
                  style={{
                    maxWidth: '100%',
                    maxHeight: 260,
                    borderRadius: 8,
                    display: 'block',
                  }}
                />
              ) : (
                <p
                  className="muted"
                  style={{ margin: '6px 0', fontSize: 13 }}
                >
                  Aucune image — choisissez-en une ci-dessous.
                </p>
              )}
              <div
                style={{
                  marginTop: 10,
                  display: 'grid',
                  gap: 8,
                  gridTemplateColumns: '1fr 1fr',
                }}
              >
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => void handleUploadImage(e, 'cover')}
                    disabled={uploading}
                  />
                </div>
                <input
                  type="text"
                  placeholder="Alt text (SEO + accessibilité)\u2026"
                  value={coverImageAlt}
                  onChange={(e) => {
                    setCoverImageAlt(e.target.value);
                    setDirty(true);
                  }}
                  style={{
                    padding: '6px 10px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                />
              </div>
            </div>
          </section>

          {/* Éditeur Tiptap */}
          <TiptapEditor
            value={bodyHtml}
            onChange={(html) => {
              setBodyHtml(html);
              setDirty(true);
            }}
            placeholder="Rédigez le corps de votre article\u2026 (H2, paragraphes, listes, images, liens\u2026)"
            minChars={300}
          />
        </div>

        {/* ========== Sidebar SEO ========== */}
        <aside className="article-editor__side">
          {/* Preview Google */}
          <section>
            <h3>Aperçu Google</h3>
            <div className="serp-preview">
              <div className="serp-preview__url">{urlPreview}</div>
              <div className="serp-preview__title">
                {seoTitleFinal || 'Votre titre SEO\u2026'}
              </div>
              <div className="serp-preview__desc">
                {seoDescriptionFinal ||
                  'Votre meta description apparaîtra ici\u2026'}
              </div>
            </div>
          </section>

          {/* SEO basique */}
          <section>
            <h3>SEO — Métadonnées</h3>
            <SeoField
              label="Meta title"
              id="seo-title"
              value={seoTitle}
              onChange={markDirty(setSeoTitle)}
              maxLength={70}
              idealMin={50}
              idealMax={60}
              placeholder="(vide = utilise le titre)"
              fallback={title}
            />
            <SeoField
              label="Meta description"
              id="seo-desc"
              value={seoDescription}
              onChange={markDirty(setSeoDescription)}
              textarea
              rows={3}
              maxLength={200}
              idealMin={150}
              idealMax={160}
              placeholder="(vide = utilise l\u2019excerpt)"
              fallback={excerpt}
            />
            <div className="seo-field">
              <label htmlFor="seo-slug">Slug URL</label>
              <input
                id="seo-slug"
                type="text"
                value={slug}
                onChange={(e) => {
                  setSlug(slugify(e.target.value));
                  setSlugDirty(true);
                  setDirty(true);
                }}
              />
              <span className="seo-field__hint">
                <span>
                  URL: /actualites/<strong>{slug || '...'}</strong>
                </span>
              </span>
            </div>
            <SeoField
              label="H1 (si différent du titre)"
              id="seo-h1"
              value={seoH1}
              onChange={markDirty(setSeoH1)}
              placeholder="(vide = utilise le titre)"
              maxLength={100}
            />
          </section>

          {/* Mots-clés */}
          <section>
            <h3>Mots-clés cibles (LSI)</h3>
            <div style={{ marginBottom: 8 }}>
              {seoKeywords.length === 0 ? (
                <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                  Aucun mot-clé. Ajoutez-en pour améliorer le référencement.
                </p>
              ) : (
                seoKeywords.map((k) => (
                  <span key={k} className="keyword-chip">
                    {k}
                    <button
                      type="button"
                      onClick={() => removeKeyword(k)}
                      aria-label={`Retirer ${k}`}
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                value={seoKeywordInput}
                onChange={(e) => setSeoKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
                placeholder="Ajouter un mot-clé\u2026"
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 13,
                }}
              />
              <button
                type="button"
                className="btn btn-tight"
                onClick={addKeyword}
              >
                +
              </button>
            </div>
          </section>

          {/* Catégories */}
          <section>
            <h3>Catégories</h3>
            {allCategories.length === 0 ? (
              <p className="muted" style={{ fontSize: 12 }}>
                Aucune catégorie définie.{' '}
                <Link to="/vitrine/categories">Créer des catégories →</Link>
              </p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allCategories.map((cat) => {
                  const active = article.categories.some(
                    (c) => c.id === cat.id,
                  );
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        const current = article.categories.map((c) => c.id);
                        const next = active
                          ? current.filter((id) => id !== cat.id)
                          : [...current, cat.id];
                        void setArticleCategories({
                          variables: {
                            input: {
                              articleId: article.id,
                              categoryIds: next,
                            },
                          },
                        });
                      }}
                      className={
                        active ? 'filter-chip filter-chip--active' : 'filter-chip'
                      }
                      style={
                        active && cat.color
                          ? {
                              background: cat.color,
                              color: '#fff',
                              borderColor: cat.color,
                            }
                          : !active && cat.color
                            ? {
                                background: `${cat.color}18`,
                                color: cat.color,
                                borderColor: `${cat.color}55`,
                              }
                            : undefined
                      }
                      title={active ? 'Retirer cette catégorie' : 'Ajouter à cette catégorie'}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            )}
            <p
              className="muted"
              style={{ fontSize: 11, marginTop: 8, marginBottom: 0 }}
            >
              Clic pour ajouter/retirer. Appliqué immédiatement.
            </p>
          </section>

          {/* Open Graph / Partage social */}
          <section>
            <h3>Partage social (Open Graph)</h3>
            {seoOgImageUrl ? (
              <img
                src={seoOgImageUrl}
                alt=""
                style={{
                  maxWidth: '100%',
                  borderRadius: 8,
                  marginBottom: 8,
                  display: 'block',
                }}
              />
            ) : (
              <p className="muted" style={{ fontSize: 12 }}>
                Aucune image OG (utilise l'image de couverture par défaut).
              </p>
            )}
            <div
              style={{
                display: 'flex',
                gap: 6,
                alignItems: 'center',
              }}
            >
              <input
                type="file"
                accept="image/*"
                onChange={(e) => void handleUploadImage(e, 'og')}
                disabled={uploading}
                style={{ flex: 1 }}
              />
              {seoOgImageUrl ? (
                <button
                  type="button"
                  className="btn btn-tight btn-ghost"
                  onClick={() => {
                    setSeoOgImageId(null);
                    setSeoOgImageUrl(null);
                    setDirty(true);
                  }}
                >
                  ×
                </button>
              ) : null}
            </div>
          </section>

          {/* FAQ schema.org */}
          <section>
            <h3>FAQ (schema.org FAQPage)</h3>
            {seoFaq.length === 0 ? (
              <p className="muted" style={{ fontSize: 12 }}>
                Aucune question. Ajoutez-en pour un rich snippet FAQ dans Google.
              </p>
            ) : (
              seoFaq.map((f, i) => (
                <div key={i} className="faq-item">
                  <input
                    type="text"
                    value={f.question}
                    onChange={(e) => updateFaq(i, { question: e.target.value })}
                    placeholder="Question\u2026"
                  />
                  <textarea
                    value={f.answer}
                    onChange={(e) => updateFaq(i, { answer: e.target.value })}
                    placeholder="Réponse (20-50 mots)\u2026"
                    rows={2}
                  />
                  <button
                    type="button"
                    className="btn btn-tight btn-ghost"
                    onClick={() => removeFaq(i)}
                    style={{ justifySelf: 'end' }}
                  >
                    Retirer
                  </button>
                </div>
              ))
            )}
            <button
              type="button"
              className="btn btn-tight"
              onClick={addFaq}
              style={{ marginTop: 6 }}
            >
              + Ajouter une question
            </button>
          </section>

          {/* Technique SEO */}
          <section>
            <h3>Technique</h3>
            <SeoField
              label="URL canonique"
              id="seo-canonical"
              value={seoCanonicalUrl}
              onChange={markDirty(setSeoCanonicalUrl)}
              placeholder="(vide = auto)"
              maxLength={400}
            />
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 6,
                fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                checked={seoNoindex}
                onChange={(e) => {
                  setSeoNoindex(e.target.checked);
                  setDirty(true);
                }}
              />
              <span>Ne pas indexer (noindex)</span>
            </label>
          </section>
        </aside>
      </div>
    </>
  );
}

function SeoField({
  label,
  id,
  value,
  onChange,
  placeholder,
  maxLength,
  idealMin,
  idealMax,
  textarea,
  rows,
  fallback,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  idealMin?: number;
  idealMax?: number;
  textarea?: boolean;
  rows?: number;
  fallback?: string;
}) {
  const len = value.length;
  const effective = value || fallback || '';
  const effectiveLen = effective.length;

  let hintClass = 'seo-field__hint';
  let hintMsg: string | null = null;
  if (idealMin != null && idealMax != null && effectiveLen > 0) {
    if (effectiveLen < idealMin) {
      hintClass = 'seo-field__hint seo-field__hint--warn';
      hintMsg = `Trop court (${effectiveLen}/${idealMin}-${idealMax} chars recommandé)`;
    } else if (effectiveLen > idealMax) {
      hintClass = 'seo-field__hint seo-field__hint--warn';
      hintMsg = `Trop long (${effectiveLen}/${idealMin}-${idealMax} chars recommandé)`;
    } else {
      hintClass = 'seo-field__hint seo-field__hint--ok';
      hintMsg = `Optimal (${effectiveLen}/${idealMin}-${idealMax})`;
    }
  }

  return (
    <div className="seo-field">
      <label htmlFor={id}>{label}</label>
      {textarea ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={rows ?? 2}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
        />
      )}
      <span className={hintClass}>
        <span>{hintMsg ?? `${len}${maxLength ? `/${maxLength}` : ''} chars`}</span>
        {fallback && !value ? (
          <span className="muted" style={{ fontSize: 11 }}>
            hérité du titre/excerpt
          </span>
        ) : null}
      </span>
    </div>
  );
}
