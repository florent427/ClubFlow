import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CLUB_VITRINE_ARTICLES,
  CREATE_VITRINE_ARTICLE,
  DELETE_VITRINE_ARTICLE,
  SET_VITRINE_ARTICLE_STATUS,
  type ClubVitrineArticlesData,
  type CreateVitrineArticleData,
} from '../../lib/vitrine-documents';
import { useToast } from '../../components/ToastProvider';
import { AiArticleGeneratorModal } from '../../components/AiArticleGeneratorModal';

/**
 * Hub articles vitrine — point d'entrée.
 *
 * 2 grandes actions en haut :
 *   (1) Rédaction manuelle → crée un brouillon vide et ouvre l'éditeur riche.
 *   (2) Génération IA → lance la pipeline IA, crée un brouillon rempli
 *       (contenu + SEO + images) et ouvre l'éditeur.
 *
 * Dessous : la liste des brouillons et articles publiés.
 */
export function VitrineArticlesPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  // Polling toutes les 3s tant qu'un article est en PENDING (génération IA
  // en cours). Dès que tout est DONE/FAILED, plus de refetch.
  const { data, loading, error, startPolling, stopPolling } =
    useQuery<ClubVitrineArticlesData>(CLUB_VITRINE_ARTICLES, {
      fetchPolicy: 'cache-and-network',
    });
  const hasPending = useMemo(
    () =>
      (data?.clubVitrineArticles ?? []).some(
        (a) => a.generationStatus === 'PENDING',
      ),
    [data],
  );
  // Déclenche / arrête le polling selon l'état
  useMemo(() => {
    if (hasPending) startPolling(3000);
    else stopPolling();
  }, [hasPending, startPolling, stopPolling]);
  const [createArticle, { loading: creating }] =
    useMutation<CreateVitrineArticleData>(CREATE_VITRINE_ARTICLE, {
      refetchQueries: [{ query: CLUB_VITRINE_ARTICLES }],
    });
  const [setStatus] = useMutation(SET_VITRINE_ARTICLE_STATUS, {
    refetchQueries: [{ query: CLUB_VITRINE_ARTICLES }],
  });
  const [deleteArticle] = useMutation(DELETE_VITRINE_ARTICLE, {
    refetchQueries: [{ query: CLUB_VITRINE_ARTICLES }],
  });

  const [aiOpen, setAiOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  >('ALL');

  async function createEmptyDraft(): Promise<void> {
    try {
      const emptyBody = JSON.stringify({ format: 'html', html: '<p></p>' });
      const res = await createArticle({
        variables: {
          input: {
            title: 'Nouvel article',
            excerpt: null,
            bodyJson: emptyBody,
            publishNow: false,
          },
        },
      });
      const id = res.data?.createVitrineArticle.id;
      if (!id) throw new Error('ID manquant');
      showToast('Brouillon créé. Ouverture de l\u2019éditeur\u2026', 'success');
      navigate(`/vitrine/articles/${id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  /**
   * Callback de la modale IA : dès que la génération est lancée en
   * background, on reste sur la liste (pour voir le badge "en cours" se
   * mettre à jour) ou on ouvre directement l'éditeur pour l'utilisateur
   * qui voudrait commencer à affiner manuellement en parallèle.
   *
   * Choix retenu : on reste sur la liste, c'est plus clair et permet de
   * lancer d'autres tâches en parallèle.
   */
  function handleGenerationStarted(_articleId: string): void {
    // Pas de navigation — la liste refresh via polling et le badge "en cours"
    // apparaît.
  }

  const articles = data?.clubVitrineArticles ?? [];
  const filtered =
    statusFilter === 'ALL'
      ? articles
      : articles.filter((a) => a.status === statusFilter);

  const counts = {
    total: articles.length,
    draft: articles.filter((a) => a.status === 'DRAFT').length,
    published: articles.filter((a) => a.status === 'PUBLISHED').length,
    archived: articles.filter((a) => a.status === 'ARCHIVED').length,
  };

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">
              <Link to="/vitrine">← Site vitrine</Link>
            </p>
            <h1 className="members-loom__title">
              Articles <span className="muted">({counts.total})</span>
            </h1>
            <p className="muted" style={{ marginTop: 4 }}>
              Rédigez manuellement ou laissez l'IA générer un article complet
              optimisé SEO 2026.
            </p>
          </div>
        </div>
      </header>

      {/* ===== 2 tuiles de création ===== */}
      <section className="article-hub">
        <button
          type="button"
          className="article-hub__tile article-hub__tile--manual"
          onClick={() => void createEmptyDraft()}
          disabled={creating}
        >
          <div className="article-hub__icon" aria-hidden>
            ✍
          </div>
          <div className="article-hub__body">
            <h3>Rédaction manuelle</h3>
            <p>
              Éditeur riche complet : titres, gras, italique, listes, liens,
              images inline, alignements&hellip; Accès total aux paramètres SEO
              (meta title, description, mots-clés, canonical, FAQ, Open Graph).
            </p>
            <ul className="article-hub__bullets">
              <li>Éditeur WYSIWYG type Gutenberg</li>
              <li>Image mise en avant + alt</li>
              <li>Panneau SEO complet</li>
            </ul>
            <span className="article-hub__cta">
              {creating ? 'Création\u2026' : 'Créer un brouillon vide →'}
            </span>
          </div>
        </button>

        <button
          type="button"
          className="article-hub__tile article-hub__tile--ai"
          onClick={() => setAiOpen(true)}
        >
          <div className="article-hub__icon" aria-hidden>
            ✨
          </div>
          <div className="article-hub__body">
            <h3>Génération IA</h3>
            <p>
              À partir d'une idée ou d'un texte source, l'IA rédige l'article
              complet : titre, meta, H1/H2, corps, FAQ, mots-clés LSI, image de
              couverture et images inline&mdash; le tout optimisé SEO 2026.
            </p>
            <ul className="article-hub__bullets">
              <li>Contenu + SEO généré en un seul clic</li>
              <li>Images IA : couverture + inline</li>
              <li>Brouillon modifiable avant publication</li>
            </ul>
            <span className="article-hub__cta">Lancer la génération →</span>
          </div>
        </button>
      </section>

      {/* ===== Filtres + liste ===== */}
      <section style={{ marginTop: 32 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 12,
          }}
        >
          <h2 style={{ margin: 0 }}>Mes articles</h2>
          <div className="article-hub__filters">
            <FilterChip
              label={`Tous (${counts.total})`}
              active={statusFilter === 'ALL'}
              onClick={() => setStatusFilter('ALL')}
            />
            <FilterChip
              label={`Brouillons (${counts.draft})`}
              active={statusFilter === 'DRAFT'}
              onClick={() => setStatusFilter('DRAFT')}
            />
            <FilterChip
              label={`Publiés (${counts.published})`}
              active={statusFilter === 'PUBLISHED'}
              onClick={() => setStatusFilter('PUBLISHED')}
            />
            {counts.archived > 0 ? (
              <FilterChip
                label={`Archivés (${counts.archived})`}
                active={statusFilter === 'ARCHIVED'}
                onClick={() => setStatusFilter('ARCHIVED')}
              />
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="form-error">{error.message}</p>
        ) : loading && articles.length === 0 ? (
          <p className="muted">Chargement\u2026</p>
        ) : filtered.length === 0 ? (
          <p className="muted" style={{ padding: 24, textAlign: 'center' }}>
            {statusFilter === 'ALL'
              ? 'Aucun article. Commencez par l\u2019une des 2 options ci-dessus.'
              : 'Aucun article dans cette catégorie.'}
          </p>
        ) : (
          <div className="article-list">
            {filtered.map((a) => (
              <article key={a.id} className="article-row">
                {a.coverImageUrl ? (
                  <Link
                    to={`/vitrine/articles/${a.id}`}
                    className="article-row__cover"
                  >
                    <img src={a.coverImageUrl} alt={a.coverImageAlt ?? ''} />
                  </Link>
                ) : (
                  <Link
                    to={`/vitrine/articles/${a.id}`}
                    className="article-row__cover article-row__cover--empty"
                  >
                    <span>Pas d'image</span>
                  </Link>
                )}
                <div className="article-row__body">
                  <div className="article-row__head">
                    <Link
                      to={`/vitrine/articles/${a.id}`}
                      className="article-row__title"
                    >
                      {a.title}
                    </Link>
                    <StatusBadge status={a.status} />
                    {a.generationStatus === 'PENDING' ? (
                      <span
                        className="status-badge"
                        style={{
                          background: '#dbeafe',
                          color: '#1e40af',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span className="pulse-dot" />
                        {a.generationProgress ?? 'Génération en cours\u2026'}
                      </span>
                    ) : null}
                    {a.generationStatus === 'FAILED' ? (
                      <span
                        className="status-badge"
                        style={{ background: '#fee2e2', color: '#991b1b' }}
                        title={a.generationError ?? 'Échec génération'}
                      >
                        ✕ Génération échouée
                      </span>
                    ) : null}
                    {a.generationStatus === 'DONE' &&
                    a.generationWarnings.length > 0 ? (
                      <span
                        className="status-badge"
                        style={{ background: '#fef3c7', color: '#92400e' }}
                        title={a.generationWarnings.join('\n')}
                      >
                        ⚠ {a.generationWarnings.length} avertissement(s)
                      </span>
                    ) : null}
                  </div>
                  {a.excerpt ? (
                    <p className="article-row__excerpt">{a.excerpt}</p>
                  ) : null}
                  <div className="article-row__meta">
                    <code>/actualites/{a.slug}</code>
                    <span className="muted">·</span>
                    <span className="muted">
                      {a.publishedAt
                        ? `Publié le ${new Date(a.publishedAt).toLocaleDateString('fr-FR')}`
                        : `Modifié le ${new Date(a.updatedAt).toLocaleDateString('fr-FR')}`}
                    </span>
                    {a.seoTitle ? (
                      <>
                        <span className="muted">·</span>
                        <span className="muted" title={a.seoTitle}>
                          SEO ✓
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="article-row__actions">
                  <Link
                    to={`/vitrine/articles/${a.id}`}
                    className="btn btn-tight"
                  >
                    Éditer
                  </Link>
                  {a.status !== 'PUBLISHED' ? (
                    <button
                      type="button"
                      className="btn btn-tight btn-ghost"
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
                      if (window.confirm(`Supprimer \u00ab ${a.title} \u00bb ?`)) {
                        void deleteArticle({ variables: { id: a.id } });
                      }
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <AiArticleGeneratorModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onGenerationStarted={handleGenerationStarted}
      />
    </>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? 'filter-chip filter-chip--active' : 'filter-chip'}
    >
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' }) {
  const cfg = {
    DRAFT: { label: 'Brouillon', cls: 'status-badge status-badge--draft' },
    PUBLISHED: { label: 'Publié', cls: 'status-badge status-badge--published' },
    ARCHIVED: { label: 'Archivé', cls: 'status-badge status-badge--archived' },
  }[status];
  return <span className={cfg.cls}>{cfg.label}</span>;
}

/**
 * Convertit un draft IA (sections + FAQ) en HTML compatible Tiptap.
 * Chaque section = H2 + paragraphes + image inline (si présente).
 *
 * Si une section a `inlineImagePrompt` mais pas d'URL (mode placeholders),
 * on insère un SVG placeholder avec le prompt affiché — l'utilisateur
 * pourra cliquer dessus pour remplacer par sa propre photo.
 *
 * Note : la FAQ n'est PAS injectée dans le body HTML — elle est
 * persistée dans `seoFaqJson` côté backend et rendue via la section
 * dédiée `.article-faq` sur la vitrine publique. Éviter sinon le rendu
 * dupliqué (corps + aside).
 */
function buildHtmlFromAiDraft(draft: AiArticleDraft): string {
  const parts: string[] = [];
  if (draft.h1 && draft.h1 !== draft.title) {
    parts.push(`<h1>${escapeHtml(draft.h1)}</h1>`);
  }
  for (const section of draft.sections) {
    if (section.h2) parts.push(`<h2>${escapeHtml(section.h2)}</h2>`);
    for (const p of section.paragraphs) {
      parts.push(`<p>${escapeHtml(p)}</p>`);
    }
    const alt = section.inlineImageAlt ?? section.inlineImagePrompt ?? '';
    if (section.inlineImageUrl) {
      parts.push(
        `<figure class="tiptap-img-figure" data-align="center"><img src="${escapeAttr(section.inlineImageUrl)}" alt="${escapeHtml(alt)}" /></figure>`,
      );
    } else if (section.inlineImagePrompt) {
      const placeholder = makePlaceholderSvgDataUrl(section.inlineImagePrompt);
      parts.push(
        `<figure class="tiptap-img-figure" data-align="center"><img src="${escapeAttr(placeholder)}" alt="${escapeHtml(alt)}" /></figure>`,
      );
    }
  }
  return parts.join('\n') || '<p></p>';
}

/**
 * Génère un data URL SVG qui sert de placeholder inline : gros bandeau gris
 * avec la mention "Image à remplacer" + le prompt IA suggéré. L'utilisateur
 * clique dessus dans l'éditeur → ✕ → upload sa propre photo.
 */
function makePlaceholderSvgDataUrl(prompt: string): string {
  const truncated = prompt.length > 120 ? prompt.slice(0, 117) + '\u2026' : prompt;
  const escaped = truncated
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // On découpe en lignes pour que le texte du prompt tienne proprement.
  const words = escaped.split(/\s+/);
  const lines: string[] = [];
  let buf = '';
  for (const w of words) {
    if ((buf + ' ' + w).trim().length > 50) {
      if (buf) lines.push(buf.trim());
      buf = w;
    } else {
      buf = (buf + ' ' + w).trim();
    }
    if (lines.length >= 3) break;
  }
  if (buf && lines.length < 3) lines.push(buf);

  const tspans = lines
    .map((l, i) => `<tspan x="600" dy="${i === 0 ? '0' : '28'}">${l}</tspan>`)
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" preserveAspectRatio="xMidYMid slice">
  <rect width="1200" height="675" fill="#f1f5f9"/>
  <rect x="0" y="0" width="1200" height="675" fill="url(#p)"/>
  <defs>
    <pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse">
      <rect width="40" height="40" fill="#f1f5f9"/>
      <path d="M 0 0 L 40 40 M 40 0 L 0 40" stroke="#e2e8f0" stroke-width="1"/>
    </pattern>
  </defs>
  <rect x="200" y="210" width="800" height="255" fill="#ffffff" stroke="#cbd5e1" stroke-width="2" rx="12"/>
  <g transform="translate(600, 290)" fill="#64748b" text-anchor="middle" font-family="-apple-system, Segoe UI, Roboto, sans-serif">
    <text font-size="22" font-weight="700" letter-spacing="0.5" y="0">IMAGE A REMPLACER</text>
    <text font-size="14" font-weight="400" y="28" fill="#94a3b8">Cliquez sur l'image puis sur l'icone X</text>
    <g transform="translate(0, 70)" font-size="16" fill="#475569">${tspans}</g>
  </g>
</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
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
