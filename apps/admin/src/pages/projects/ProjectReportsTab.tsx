import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import {
  DELETE_PROJECT_REPORT,
  GENERATE_PROJECT_REPORT,
  PROJECT_REPORTS,
  PUBLISH_PROJECT_REPORT,
  UNPUBLISH_PROJECT_REPORT,
  UPDATE_PROJECT_REPORT,
  type ClubProjectGraph,
  type ProjectLiveItemPublication,
  type ProjectReportGraph,
  type ProjectReportTemplate,
} from '../../lib/projects-documents';
import { useToast } from '../../components/ToastProvider';

const TEMPLATE_LABELS: Record<ProjectReportTemplate, string> = {
  COMPETITIF: 'Compétitif',
  FESTIF: 'Festif',
  BILAN: 'Bilan',
  CUSTOM: 'Personnalisé',
};

const TEMPLATE_DESCRIPTIONS: Record<ProjectReportTemplate, string> = {
  COMPETITIF:
    'Ton factuel : résultats, scores, performances, citations d’athlètes.',
  FESTIF:
    'Ton chaleureux : émotions, ambiance, remerciements, moments marquants.',
  BILAN:
    'Ton analytique : objectifs, résultats, écarts, enseignements, perspectives.',
  CUSTOM:
    'Décris toi-même l’angle recherché (ex. focus sur les performances des athlètes).',
};

const TEMPLATE_ICONS: Record<ProjectReportTemplate, string> = {
  COMPETITIF: 'emoji_events',
  FESTIF: 'celebration',
  BILAN: 'query_stats',
  CUSTOM: 'edit_note',
};

const PRESET_TEMPLATES: ProjectReportTemplate[] = [
  'COMPETITIF',
  'FESTIF',
  'BILAN',
];

export function ProjectReportsTab({
  project,
}: {
  project: ClubProjectGraph;
}) {
  const { showToast } = useToast();
  const { data, loading } = useQuery<{ projectReports: ProjectReportGraph[] }>(
    PROJECT_REPORTS,
    {
      variables: { projectId: project.id },
      fetchPolicy: 'cache-and-network',
    },
  );
  const [generate, { loading: generating }] = useMutation(
    GENERATE_PROJECT_REPORT,
    {
      refetchQueries: [
        { query: PROJECT_REPORTS, variables: { projectId: project.id } },
      ],
    },
  );
  const [update] = useMutation(UPDATE_PROJECT_REPORT, {
    refetchQueries: [
      { query: PROJECT_REPORTS, variables: { projectId: project.id } },
    ],
  });
  const [publish] = useMutation(PUBLISH_PROJECT_REPORT, {
    refetchQueries: [
      { query: PROJECT_REPORTS, variables: { projectId: project.id } },
    ],
  });
  const [unpublish] = useMutation(UNPUBLISH_PROJECT_REPORT, {
    refetchQueries: [
      { query: PROJECT_REPORTS, variables: { projectId: project.id } },
    ],
  });
  const [remove] = useMutation(DELETE_PROJECT_REPORT, {
    refetchQueries: [
      { query: PROJECT_REPORTS, variables: { projectId: project.id } },
    ],
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [customPanelOpen, setCustomPanelOpen] = useState(false);

  const reports = data?.projectReports ?? [];

  async function handleGenerate(template: ProjectReportTemplate) {
    if (template === 'CUSTOM') {
      // On ouvre plutôt le panneau pour que l'admin saisisse le prompt
      // et relance via handleGenerateCustom.
      setCustomPanelOpen(true);
      return;
    }
    try {
      await generate({
        variables: { input: { projectId: project.id, template } },
      });
      showToast('Brouillon IA généré.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : 'Échec de la génération IA (quota ? clé ?)',
        'error',
      );
    }
  }

  async function handleGenerateCustom() {
    const prompt = customPrompt.trim();
    if (!prompt) {
      showToast('Écris d’abord ton prompt.', 'error');
      return;
    }
    if (prompt.length > 2000) {
      showToast('Prompt trop long (max 2000 caractères).', 'error');
      return;
    }
    try {
      await generate({
        variables: {
          input: {
            projectId: project.id,
            template: 'CUSTOM',
            customPrompt: prompt,
          },
        },
      });
      showToast('Brouillon IA généré.', 'success');
      setCustomPrompt('');
      setCustomPanelOpen(false);
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : 'Échec de la génération IA (quota ? clé ?)',
        'error',
      );
    }
  }

  async function handleSave(id: string) {
    try {
      const parsed = bodyTextToTiptap(editDraft);
      await update({
        variables: {
          input: { id, bodyJson: JSON.stringify(parsed) },
        },
      });
      setEditingId(null);
      showToast('Compte-rendu enregistré.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de l’enregistrement',
        'error',
      );
    }
  }

  async function handlePublish(
    id: string,
    target: ProjectLiveItemPublication,
  ) {
    try {
      await publish({ variables: { input: { id, target } } });
      showToast('Publication créée.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de la publication',
        'error',
      );
    }
  }

  async function handleUnpublish(id: string) {
    try {
      await unpublish({ variables: { id } });
      showToast('Compte-rendu repassé en brouillon.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Erreur',
        'error',
      );
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Supprimer définitivement ce compte-rendu ?')) return;
    try {
      await remove({ variables: { id } });
      showToast('Compte-rendu supprimé.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Erreur',
        'error',
      );
    }
  }

  return (
    <div className="cf-project-reports">
      <section>
        <h3>Générer un compte-rendu IA</h3>
        <div className="cf-project-reports__presets">
          {PRESET_TEMPLATES.map((t) => (
            <button
              key={t}
              type="button"
              className="cf-project-reports__preset"
              disabled={generating}
              onClick={() => handleGenerate(t)}
            >
              <span
                className="material-symbols-outlined cf-project-reports__preset-icon"
                aria-hidden
              >
                {TEMPLATE_ICONS[t]}
              </span>
              <strong>{TEMPLATE_LABELS[t]}</strong>
              <small>{TEMPLATE_DESCRIPTIONS[t]}</small>
            </button>
          ))}
          <button
            type="button"
            className={`cf-project-reports__preset cf-project-reports__preset--custom${
              customPanelOpen ? ' cf-project-reports__preset--active' : ''
            }`}
            disabled={generating}
            onClick={() => setCustomPanelOpen((v) => !v)}
          >
            <span
              className="material-symbols-outlined cf-project-reports__preset-icon"
              aria-hidden
            >
              {TEMPLATE_ICONS.CUSTOM}
            </span>
            <strong>{TEMPLATE_LABELS.CUSTOM}</strong>
            <small>{TEMPLATE_DESCRIPTIONS.CUSTOM}</small>
          </button>
        </div>

        {customPanelOpen && (
          <div className="cf-card cf-project-reports__custom-panel">
            <h4>
              <span className="material-symbols-outlined" aria-hidden>
                edit_note
              </span>
              Ton prompt personnalisé
            </h4>
            <p className="cf-text-muted">
              Décris précisément l’angle, le ton, le focus. L’IA a déjà le
              contexte du projet et les photos validées. Évite les fausses
              citations : précise si tu veux (ou non) inclure des noms.
            </p>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Ex. Fais-moi un compte-rendu des performances de nos athlètes : résultats, médailles, temps forts, avec un ton motivant pour nos partenaires."
              rows={6}
              maxLength={2000}
              className="cf-textarea"
              autoFocus
            />
            <div className="cf-project-reports__custom-footer">
              <small className="cf-text-muted">
                {customPrompt.length} / 2000 caractères
              </small>
              <div className="cf-form__actions">
                <button
                  type="button"
                  className="cf-btn cf-btn--ghost"
                  onClick={() => {
                    setCustomPanelOpen(false);
                    setCustomPrompt('');
                  }}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="cf-btn cf-btn--primary"
                  onClick={handleGenerateCustom}
                  disabled={generating || customPrompt.trim().length === 0}
                >
                  {generating ? 'Génération…' : 'Lancer la génération'}
                </button>
              </div>
            </div>
          </div>
        )}

        {generating && (
          <p className="cf-text-muted">
            Génération en cours — ça prend généralement 15-30 secondes…
          </p>
        )}
      </section>

      <section>
        <h3>Comptes-rendus existants</h3>
        {loading && reports.length === 0 ? (
          <p>Chargement…</p>
        ) : reports.length === 0 ? (
          <p className="cf-text-muted">
            Aucun compte-rendu encore généré. Choisis un preset ci-dessus pour
            lancer une génération IA.
          </p>
        ) : (
          <ul className="cf-project-reports__list">
            {reports.map((r) => (
              <li key={r.id} className="cf-card cf-project-reports__item">
                <header>
                  <div>
                    <strong>{TEMPLATE_LABELS[r.template]}</strong>
                    <span
                      className={`cf-badge cf-badge--${r.status === 'PUBLISHED' ? 'success' : 'neutral'}`}
                    >
                      {r.status === 'PUBLISHED' ? 'Publié' : 'Brouillon'}
                    </span>
                    <small>
                      généré le{' '}
                      {new Date(r.createdAt).toLocaleString('fr-FR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </small>
                  </div>
                  <div className="cf-project-reports__item-actions">
                    {r.status === 'DRAFT' && editingId !== r.id && (
                      <button
                        type="button"
                        className="cf-btn cf-btn--sm"
                        onClick={() => {
                          setEditingId(r.id);
                          setEditDraft(bodyJsonToPlainText(r.bodyJson));
                        }}
                      >
                        Éditer
                      </button>
                    )}
                    {r.status === 'DRAFT' && (
                      <>
                        <button
                          type="button"
                          className="cf-btn cf-btn--sm cf-btn--primary"
                          onClick={() => handlePublish(r.id, 'VITRINE_NEWS')}
                        >
                          Publier → Actus
                        </button>
                        <button
                          type="button"
                          className="cf-btn cf-btn--sm"
                          onClick={() => handlePublish(r.id, 'VITRINE_BLOG')}
                        >
                          Publier → Blog
                        </button>
                      </>
                    )}
                    {r.status === 'PUBLISHED' && (
                      <button
                        type="button"
                        className="cf-btn cf-btn--sm cf-btn--ghost"
                        onClick={() => handleUnpublish(r.id)}
                      >
                        Dépublier
                      </button>
                    )}
                    <button
                      type="button"
                      className="cf-btn cf-btn--sm cf-btn--danger cf-btn--ghost"
                      onClick={() => handleDelete(r.id)}
                      disabled={r.status === 'PUBLISHED'}
                      title={
                        r.status === 'PUBLISHED'
                          ? 'Dépubliez d’abord'
                          : 'Supprimer'
                      }
                    >
                      <span className="material-symbols-outlined" aria-hidden>
                        delete
                      </span>
                    </button>
                  </div>
                </header>

                {editingId === r.id ? (
                  <>
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={18}
                      className="cf-textarea"
                    />
                    <div className="cf-form__actions">
                      <button
                        type="button"
                        className="cf-btn cf-btn--ghost"
                        onClick={() => setEditingId(null)}
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        className="cf-btn cf-btn--primary"
                        onClick={() => handleSave(r.id)}
                      >
                        Enregistrer
                      </button>
                    </div>
                  </>
                ) : (
                  <pre className="cf-project-reports__preview">
                    {bodyJsonToPlainText(r.bodyJson)}
                  </pre>
                )}

                {r.customPrompt && (
                  <p className="cf-text-muted cf-project-reports__custom-echo">
                    <span className="material-symbols-outlined" aria-hidden>
                      edit_note
                    </span>{' '}
                    Prompt utilisé : « {r.customPrompt} »
                  </p>
                )}
                {r.sourceLiveItemIds.length > 0 && (
                  <p className="cf-text-muted">
                    <span className="material-symbols-outlined" aria-hidden>
                      photo_library
                    </span>{' '}
                    Basé sur {r.sourceLiveItemIds.length} photo(s)/vidéo(s)
                    validée(s).
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function bodyJsonToPlainText(bodyJson: string): string {
  try {
    const doc = JSON.parse(bodyJson) as {
      content?: Array<{
        type?: string;
        attrs?: { level?: number };
        content?: Array<{ type?: string; text?: string }>;
      }>;
    };
    return (doc.content ?? [])
      .map((node) => {
        const text = (node.content ?? [])
          .map((c) => (c.type === 'text' ? (c.text ?? '') : ''))
          .join('');
        if (node.type === 'heading') {
          const prefix = '#'.repeat(node.attrs?.level ?? 1);
          return `${prefix} ${text}`;
        }
        return text;
      })
      .filter(Boolean)
      .join('\n\n');
  } catch {
    return '';
  }
}

function bodyTextToTiptap(text: string): unknown {
  const lines = text.split(/\n\n+/).map((l) => l.trim()).filter(Boolean);
  return {
    type: 'doc',
    content: lines.map((line) => {
      const h = line.match(/^(#{1,3})\s+(.+)$/);
      if (h) {
        return {
          type: 'heading',
          attrs: { level: h[1].length },
          content: [{ type: 'text', text: h[2] }],
        };
      }
      return {
        type: 'paragraph',
        content: [{ type: 'text', text: line }],
      };
    }),
  };
}
