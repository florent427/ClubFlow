import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CLUB_VITRINE_PAGE,
  UPDATE_VITRINE_PAGE_SECTION,
  UPDATE_VITRINE_PAGE_SEO,
  type ClubVitrinePageData,
} from '../../lib/vitrine-documents';
import { useToast } from '../../components/ToastProvider';

interface Section {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

/**
 * Éditeur Phase 1 : formulaire JSON par section.
 *
 * Pour chaque section, on affiche ses `props` comme JSON éditable dans un
 * textarea avec bouton « Enregistrer ». Une évolution Phase 2 (form dédié
 * par type de bloc, ou éditeur inline sur la vitrine) est prévue.
 *
 * C'est volontairement minimal pour livrer rapidement un admin fonctionnel ;
 * l'usage principal est l'édition inline côté vitrine.
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

  const page = data?.clubVitrinePage ?? null;
  const sections = useMemo<Section[]>(() => {
    if (!page) return [];
    try {
      return JSON.parse(page.sectionsJson) as Section[];
    } catch {
      return [];
    }
  }, [page]);

  const vitrineUrl =
    (import.meta.env as Record<string, string | undefined>)
      .VITE_VITRINE_URL ?? 'http://localhost:5175';

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
        Page « {slug} » introuvable. Lancez le seed vitrine si besoin.
      </p>
    );

  const publicUrl = `${vitrineUrl}${slug === 'index' ? '' : '/' + slug}`;

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">
              <Link to="/vitrine">← Site vitrine</Link> · Édition
            </p>
            <h1 className="members-loom__title">
              {slug}{' '}
              <small style={{ color: 'var(--text-soft, #888)', fontSize: 16 }}>
                ({sections.length} sections)
              </small>
            </h1>
          </div>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener"
            className="btn btn-ghost"
          >
            Aperçu public ↗
          </a>
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
          Chaque section est un bloc typé. Modifiez les props en JSON et
          enregistrez — une révision est créée à chaque sauvegarde.
        </p>

        {sections.map((section, i) => (
          <SectionCard
            key={section.id}
            index={i}
            pageId={page.id}
            section={section}
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
    <section
      style={{
        border: '1px solid var(--border, #ddd)',
        borderRadius: 8,
        padding: 16,
        marginTop: 16,
      }}
    >
      <h3 style={{ margin: '0 0 12px' }}>SEO</h3>
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
  pageId,
  section,
  onSaved,
}: {
  index: number;
  pageId: string;
  section: Section;
  onSaved: () => void;
}) {
  const [patchText, setPatchText] = useState(() =>
    JSON.stringify(section.props, null, 2),
  );
  const [save, { loading }] = useMutation(UPDATE_VITRINE_PAGE_SECTION, {
    refetchQueries: [],
  });

  async function onSave(): Promise<void> {
    let patchJson = '{}';
    try {
      JSON.parse(patchText); // validate
      patchJson = patchText;
    } catch (err) {
      alert(`JSON invalide : ${err instanceof Error ? err.message : err}`);
      return;
    }
    try {
      await save({
        variables: {
          input: { pageId, sectionId: section.id, patchJson },
        },
      });
      onSaved();
    } catch (err) {
      alert(`Échec : ${err instanceof Error ? err.message : err}`);
    }
  }

  return (
    <article
      style={{
        border: '1px solid var(--border, #ddd)',
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <strong>
          #{index + 1} · {section.type}
        </strong>
        <code
          style={{ fontSize: 11, color: 'var(--text-soft, #888)' }}
          title={section.id}
        >
          {section.id.slice(0, 8)}…
        </code>
      </header>
      <textarea
        value={patchText}
        onChange={(e) => setPatchText(e.target.value)}
        rows={Math.max(6, Math.min(24, patchText.split('\n').length + 1))}
        disabled={loading}
        style={{
          width: '100%',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
          marginTop: 8,
        }}
      />
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn btn-tight"
          disabled={loading}
          onClick={() => void onSave()}
        >
          {loading ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </article>
  );
}
