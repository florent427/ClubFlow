import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CLUB_VITRINE_ARTICLES,
  CREATE_VITRINE_ARTICLE,
  DELETE_VITRINE_ARTICLE,
  REORDER_VITRINE_ARTICLES,
  SET_VITRINE_ARTICLE_CHANNEL,
  SET_VITRINE_ARTICLE_PINNED,
  SET_VITRINE_ARTICLE_STATUS,
  type ClubVitrineArticlesData,
  type CreateVitrineArticleData,
  type VitrineArticleChannel,
} from '../../lib/vitrine-documents';
import { useToast } from '../../components/ToastProvider';
import { AiArticleGeneratorModal } from '../../components/AiArticleGeneratorModal';

type ChannelTab = 'ALL' | VitrineArticleChannel;

function channelLabel(c: VitrineArticleChannel): string {
  return c === 'NEWS' ? 'Actualité' : 'Blog';
}
function publicPathForChannel(c: VitrineArticleChannel, slug: string): string {
  return c === 'NEWS' ? `/actualites/${slug}` : `/blog/${slug}`;
}

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
  // Onglet canal — persisté dans l'URL (`?channel=NEWS|BLOG|ALL`) pour que
  // les liens d'onglet partagés et le back-browser fonctionnent.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlChannel = searchParams.get('channel');
  const activeChannel: ChannelTab =
    urlChannel === 'NEWS' || urlChannel === 'BLOG' ? urlChannel : 'ALL';
  const queryChannel: VitrineArticleChannel | undefined =
    activeChannel === 'ALL' ? undefined : activeChannel;

  function setChannel(next: ChannelTab): void {
    const params = new URLSearchParams(searchParams);
    if (next === 'ALL') params.delete('channel');
    else params.set('channel', next);
    setSearchParams(params, { replace: true });
  }

  // Polling toutes les 3s tant qu'un article est en PENDING (génération IA
  // en cours). Dès que tout est DONE/FAILED, plus de refetch.
  const { data, loading, error, startPolling, stopPolling, refetch } =
    useQuery<ClubVitrineArticlesData>(CLUB_VITRINE_ARTICLES, {
      variables: { channel: queryChannel },
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
      onCompleted: () => void refetch(),
    });
  const [setStatus] = useMutation(SET_VITRINE_ARTICLE_STATUS, {
    onCompleted: () => void refetch(),
  });
  // Après une mutation on refetch avec le filtre courant pour que la vue
  // reste cohérente — un simple refetch() couvre ALL/NEWS/BLOG.
  const refetchCurrent = () => refetch();
  const [deleteArticle] = useMutation(DELETE_VITRINE_ARTICLE, {
    onCompleted: refetchCurrent,
  });
  const [setPinned] = useMutation(SET_VITRINE_ARTICLE_PINNED, {
    onCompleted: refetchCurrent,
  });
  const [reorder] = useMutation(REORDER_VITRINE_ARTICLES, {
    onCompleted: refetchCurrent,
  });
  const [setArticleChannelMut] = useMutation(SET_VITRINE_ARTICLE_CHANNEL, {
    onCompleted: refetchCurrent,
  });

  const [aiOpen, setAiOpen] = useState(false);
  // Drag-and-drop : piste l'ordre localement le temps que la mutation
  // réordonne côté serveur, pour éviter un « saut » visuel.
  const [dragId, setDragId] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  >('ALL');

  /**
   * Canal utilisé à la création : si un onglet spécifique est sélectionné,
   * on crée dans ce canal. En mode « Tous », on retombe sur BLOG par défaut
   * (l'admin peut basculer ensuite via le bouton « → Actualités / Blog »).
   */
  const createChannel: VitrineArticleChannel =
    activeChannel === 'ALL' ? 'BLOG' : activeChannel;

  async function createEmptyDraft(): Promise<void> {
    try {
      const emptyBody = JSON.stringify({ format: 'html', html: '<p></p>' });
      const res = await createArticle({
        variables: {
          input: {
            title:
              createChannel === 'NEWS'
                ? 'Nouvelle actualité'
                : 'Nouvel article',
            excerpt: null,
            bodyJson: emptyBody,
            publishNow: false,
            channel: createChannel,
          },
        },
      });
      const id = res.data?.createVitrineArticle.id;
      if (!id) throw new Error('ID manquant');
      showToast(
        createChannel === 'NEWS'
          ? 'Brouillon d\u2019actualité créé. Ouverture de l\u2019éditeur\u2026'
          : 'Brouillon de blog créé. Ouverture de l\u2019éditeur\u2026',
        'success',
      );
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

  // ---------- Drag and drop (ordre manuel) ----------
  function onDragStart(id: string): void {
    setDragId(id);
  }
  function onDragOver(e: React.DragEvent, overId: string): void {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    const current = localOrder ?? articles.map((a) => a.id);
    const from = current.indexOf(dragId);
    const to = current.indexOf(overId);
    if (from < 0 || to < 0) return;
    const next = [...current];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    setLocalOrder(next);
  }
  async function onDragEnd(): Promise<void> {
    if (!localOrder) {
      setDragId(null);
      return;
    }
    try {
      await reorder({ variables: { orderedIds: localOrder } });
      showToast('Ordre mis à jour', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Impossible de réordonner',
        'error',
      );
    } finally {
      setDragId(null);
      setLocalOrder(null);
    }
  }

  async function togglePin(id: string, next: boolean): Promise<void> {
    try {
      await setPinned({ variables: { id, pinned: next } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function switchChannel(
    id: string,
    title: string,
    currentChannel: VitrineArticleChannel,
  ): Promise<void> {
    const nextChannel: VitrineArticleChannel =
      currentChannel === 'NEWS' ? 'BLOG' : 'NEWS';
    const nextLabel = channelLabel(nextChannel);
    const confirmMsg =
      `Basculer « ${title} » vers le canal ${nextLabel} ?\n\n` +
      `L'article conserve son titre, son contenu, son SEO, ses catégories ` +
      `et ses commentaires. Il apparaîtra désormais sur ` +
      `${nextChannel === 'NEWS' ? '/actualites' : '/blog'} à la place de ` +
      `${currentChannel === 'NEWS' ? '/actualites' : '/blog'}.`;
    if (!window.confirm(confirmMsg)) return;
    try {
      await setArticleChannelMut({
        variables: { id, channel: nextChannel },
      });
      showToast(`Article basculé vers ${nextLabel}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  const articles = data?.clubVitrineArticles ?? [];
  // Si on est en cours de drag local, on applique l'ordre optimistique.
  const orderedArticles = localOrder
    ? localOrder
        .map((id) => articles.find((a) => a.id === id))
        .filter((a): a is (typeof articles)[number] => a != null)
        .concat(
          articles.filter((a) => !localOrder.includes(a.id)),
        )
    : articles;
  const filtered =
    statusFilter === 'ALL'
      ? orderedArticles
      : orderedArticles.filter((a) => a.status === statusFilter);

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
              {activeChannel === 'NEWS'
                ? 'Actualités'
                : activeChannel === 'BLOG'
                  ? 'Blog'
                  : 'Articles'}{' '}
              <span className="muted">({counts.total})</span>
            </h1>
            <p className="muted" style={{ marginTop: 4 }}>
              Même éditeur, même SEO, même génération IA pour les deux
              canaux. <strong>Actualités</strong> publie sur{' '}
              <code>/actualites</code>, <strong>Blog</strong> sur{' '}
              <code>/blog</code>. On peut basculer un article d'un canal à
              l'autre d'un clic.
            </p>
            <div className="article-hub__filters" style={{ marginTop: 12 }}>
              <TabChip
                label="Tous"
                active={activeChannel === 'ALL'}
                onClick={() => setChannel('ALL')}
              />
              <TabChip
                label="Actualités"
                active={activeChannel === 'NEWS'}
                onClick={() => setChannel('NEWS')}
              />
              <TabChip
                label="Blog"
                active={activeChannel === 'BLOG'}
                onClick={() => setChannel('BLOG')}
              />
            </div>
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
              <article
                key={a.id}
                className={`article-row${a.pinned ? ' article-row--pinned' : ''}${dragId === a.id ? ' article-row--dragging' : ''}`}
                draggable
                onDragStart={() => onDragStart(a.id)}
                onDragOver={(e) => onDragOver(e, a.id)}
                onDragEnd={() => void onDragEnd()}
              >
                <span
                  className="article-row__drag-handle"
                  title="Glisser-déposer pour réordonner"
                  aria-hidden
                >
                  ⋮⋮
                </span>
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
                      {a.pinned ? '📌 ' : ''}
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
                    <code>{publicPathForChannel(a.channel, a.slug)}</code>
                    <span className="muted">·</span>
                    <span className="muted" title={`Canal ${a.channel}`}>
                      {a.channel === 'NEWS' ? '📰 Actualité' : '✍ Blog'}
                    </span>
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
                  <button
                    type="button"
                    className="btn btn-tight btn-ghost"
                    title={a.pinned ? 'Désépingler' : 'Épingler en haut'}
                    onClick={() => void togglePin(a.id, !a.pinned)}
                  >
                    {a.pinned ? '📌 Désépingler' : '📌 Épingler'}
                  </button>
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
                    title={
                      a.channel === 'NEWS'
                        ? 'Basculer cet article vers le Blog (contenu de fond)'
                        : 'Basculer cet article vers les Actualités'
                    }
                    onClick={() =>
                      void switchChannel(a.id, a.title, a.channel)
                    }
                  >
                    {a.channel === 'NEWS' ? '→ Blog' : '→ Actualités'}
                  </button>
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
        channel={createChannel}
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

/** Onglet de canal (Tous / Actualités / Blog) — variante visuelle du FilterChip. */
function TabChip({
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
      style={{ fontWeight: active ? 600 : 500 }}
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
// Note : fonction `buildHtmlFromAiDraft` supprimée — type `AiArticleDraft`
// n'existait pas (dead code). Logique préservée dans git history si besoin
// de réactiver le pipeline IA → article HTML.

