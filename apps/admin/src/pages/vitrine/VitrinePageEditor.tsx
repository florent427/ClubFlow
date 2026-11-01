import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CLUB_VITRINE_PAGE,
  REORDER_VITRINE_PAGE_SECTIONS,
  UPDATE_VITRINE_PAGE_SECTION,
  UPDATE_VITRINE_PAGE_SEO,
  type ClubVitrinePageData,
} from '../../lib/vitrine-documents';
import { useToast } from '../../components/ToastProvider';
import { useCurrentClub } from '../../lib/use-current-club';
import { OpenEditModeButton } from './OpenEditModeButton';
import { SectionPropsForm } from './SectionPropsForm';
import { blockLabel, moveItem } from './section-form';

interface Section {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

/**
 * Éditeur des pages de la vitrine.
 *
 * Chaque section s'ouvre sur un formulaire déduit de ses `props` (textes,
 * images de la médiathèque, listes à compléter ou réordonner), avec un mode
 * JSON en secours. L'ordre des sections se règle ici ; l'édition directe sur
 * le site reste accessible par « Éditer sur le site ».
 */
export function VitrinePageEditor() {
  const { slug = 'index' } = useParams<{ slug: string }>();
  const { showToast } = useToast();

  const { data, loading, error } = useQuery<ClubVitrinePageData>(
    CLUB_VITRINE_PAGE,
    {
      variables: { slug },
      fetchPolicy: 'cache-and-network',
    },
  );
  const [reorder, { loading: reordering }] = useMutation(
    REORDER_VITRINE_PAGE_SECTIONS,
  );

  const page = data?.clubVitrinePage ?? null;
  const sections = useMemo<Section[]>(() => {
    if (!page) return [];
    try {
      return JSON.parse(page.sectionsJson) as Section[];
    } catch {
      return [];
    }
  }, [page]);

  // URL dynamique du club courant (priorité customDomain ACTIVE, sinon
  // subdomain fallback). Calculée côté API. Cf. useCurrentClub.
  const { club: currentClub } = useCurrentClub();
  const vitrineUrl =
    currentClub?.vitrinePublicUrl ??
    (import.meta.env as Record<string, string | undefined>)
      .VITE_VITRINE_URL ??
    'http://localhost:5175';

  if (loading && !page) return <p className="muted">Chargement…</p>;
  if (error)
    return (
      <p className="form-error" role="alert">
        {error.message}
      </p>
    );
  if (!page)
    return (
      <p className="muted">
        Page « {slug} » introuvable. Contactez le support si votre site n'a
        pas été initialisé.
      </p>
    );

  const pageId = page.id;
  const sitePath = slug === 'index' ? '/' : `/${slug}`;
  const publicUrl = `${vitrineUrl}${slug === 'index' ? '' : '/' + slug}`;

  async function move(from: number, to: number): Promise<void> {
    const ids = moveItem(
      sections.map((s) => s.id),
      from,
      to,
    );
    try {
      await reorder({
        variables: { input: { pageId, orderedSectionIds: ids } },
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">
              <Link to="/vitrine">← Site vitrine</Link> · Édition
            </p>
            <h1 className="members-loom__title">
              {slug === 'index' ? 'Accueil' : slug}{' '}
              <small style={{ color: 'var(--text-soft, #888)', fontSize: 16 }}>
                ({sections.length} sections)
              </small>
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <OpenEditModeButton redirect={sitePath} className="btn btn-primary">
              Éditer sur le site ↗
            </OpenEditModeButton>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener"
              className="btn btn-ghost"
            >
              Aperçu public ↗
            </a>
          </div>
        </div>
      </header>

      <SeoEditor
        pageId={page.id}
        seoTitle={page.seoTitle}
        seoDescription={page.seoDescription}
      />

      <section style={{ marginTop: 24 }}>
        <h2 className="members-loom__title" style={{ fontSize: 22 }}>
          Sections
        </h2>
        <p className="muted" style={{ marginBottom: 16 }}>
          Ouvrez une section pour modifier ses textes, ses images et ses
          listes. Les flèches changent l'ordre d'affichage sur le site. Une
          révision est créée à chaque enregistrement.
        </p>

        {sections.map((section, i) => (
          <SectionCard
            key={section.id}
            index={i}
            count={sections.length}
            pageId={page.id}
            section={section}
            reordering={reordering}
            onMove={(to) => void move(i, to)}
            onSaved={() => showToast('Section enregistrée.', 'success')}
          />
        ))}
      </section>
    </>
  );
}

function SeoEditor({
  pageId,
  seoTitle,
  seoDescription,
}: {
  pageId: string;
  seoTitle: string | null;
  seoDescription: string | null;
}) {
  const { showToast } = useToast();
  const [title, setTitle] = useState(seoTitle ?? '');
  const [desc, setDesc] = useState(seoDescription ?? '');
  const [save, { loading }] = useMutation(UPDATE_VITRINE_PAGE_SEO, {
    refetchQueries: [],
  });

  async function onSave(): Promise<void> {
    try {
      await save({
        variables: {
          input: { pageId, seoTitle: title, seoDescription: desc },
        },
      });
      showToast('SEO enregistré.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  return (
    <section className="vpe-card" style={{ marginTop: 16 }}>
      <h3 style={{ margin: '0 0 12px' }}>Référencement (SEO)</h3>
      <label className="field">
        <span>Titre (balise &lt;title&gt;)</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={loading}
          maxLength={70}
        />
      </label>
      <label className="field">
        <span>Description (meta description, 155 car. max)</span>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          disabled={loading}
          rows={3}
          maxLength={170}
        />
      </label>
      <button
        type="button"
        className="btn btn-tight"
        disabled={loading}
        onClick={() => void onSave()}
      >
        {loading ? 'Enregistrement…' : 'Enregistrer SEO'}
      </button>
    </section>
  );
}

function SectionCard({
  index,
  count,
  pageId,
  section,
  reordering,
  onMove,
  onSaved,
}: {
  index: number;
  count: number;
  pageId: string;
  section: Section;
  reordering: boolean;
  onMove: (to: number) => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const saved = useMemo(() => JSON.stringify(section.props), [section.props]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(section.props);
  const [baseline, setBaseline] = useState(saved);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [save, { loading }] = useMutation(UPDATE_VITRINE_PAGE_SECTION, {
    refetchQueries: [],
  });

  // Section modifiée ailleurs (édition sur le site, restauration) : on
  // reprend la version enregistrée, sauf si une saisie est en cours.
  if (saved !== baseline) {
    if (JSON.stringify(draft) === baseline) setDraft(section.props);
    setBaseline(saved);
  }

  const dirty = jsonMode
    ? jsonText !== JSON.stringify(draft, null, 2) || JSON.stringify(draft) !== saved
    : JSON.stringify(draft) !== saved;

  function parseJson(): Record<string, unknown> | null {
    try {
      const parsed: unknown = JSON.parse(jsonText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('un objet { … } est attendu');
      }
      return parsed as Record<string, unknown>;
    } catch (err) {
      showToast(
        `JSON invalide : ${err instanceof Error ? err.message : String(err)}`,
        'error',
      );
      return null;
    }
  }

  function toggleJson(): void {
    if (jsonMode) {
      const parsed = parseJson();
      if (!parsed) return;
      setDraft(parsed);
    } else {
      setJsonText(JSON.stringify(draft, null, 2));
    }
    setJsonMode(!jsonMode);
  }

  function cancel(): void {
    setDraft(section.props);
    setJsonText(JSON.stringify(section.props, null, 2));
  }

  async function onSave(): Promise<void> {
    const props = jsonMode ? parseJson() : draft;
    if (!props) return;
    try {
      await save({
        variables: {
          input: { pageId, sectionId: section.id, patchJson: JSON.stringify(props) },
        },
      });
      setDraft(props);
      onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  return (
    <article className={`vpe-card vpe-section${open ? ' is-open' : ''}`}>
      <header className="vpe-section__head">
        <button
          type="button"
          className="vpe-section__toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="vpe-section__num">{index + 1}</span>
          <span>
            <strong>{blockLabel(section.type)}</strong>
            {dirty ? (
              <span className="vpe-section__dirty"> · non enregistré</span>
            ) : null}
            <small className="muted vpe-section__type">{section.type}</small>
          </span>
        </button>
        <span className="vpe-list__tools">
          <button
            type="button"
            className="vpe-icon"
            aria-label="Monter la section"
            title="Monter la section"
            disabled={index === 0 || reordering}
            onClick={() => onMove(index - 1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="vpe-icon"
            aria-label="Descendre la section"
            title="Descendre la section"
            disabled={index === count - 1 || reordering}
            onClick={() => onMove(index + 1)}
          >
            ↓
          </button>
        </span>
      </header>

      {open ? (
        <div className="vpe-section__body">
          {jsonMode ? (
            <textarea
              className="vpe-json"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              rows={Math.max(6, Math.min(24, jsonText.split('\n').length + 1))}
              disabled={loading}
              spellCheck={false}
            />
          ) : (
            <SectionPropsForm value={draft} onChange={setDraft} />
          )}
          <div className="vpe-section__actions">
            <button
              type="button"
              className="btn btn-primary btn-tight"
              disabled={loading || !dirty}
              onClick={() => void onSave()}
            >
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-tight"
              disabled={loading || !dirty}
              onClick={cancel}
            >
              Annuler les modifications
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-tight vpe-section__json"
              onClick={toggleJson}
            >
              {jsonMode ? 'Revenir au formulaire' : 'Mode avancé (JSON)'}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
