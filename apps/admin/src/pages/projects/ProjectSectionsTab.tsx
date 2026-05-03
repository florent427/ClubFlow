import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  ATTACH_PROJECT_SECTION_DOCUMENT,
  CLUB_PROJECT_SECTIONS,
  DETACH_PROJECT_SECTION_DOCUMENT,
  PROJECT_SECTION_ATTACHMENTS,
  RENAME_PROJECT_SECTION,
  UPDATE_PROJECT_SECTION_BODY,
  type ClubProjectGraph,
  type ProjectSectionAttachmentGraph,
  type ProjectSectionGraph,
  type ProjectSectionKind,
} from '../../lib/projects-documents';
import { useToast } from '../../components/ToastProvider';
import { getClubId, getToken } from '../../lib/storage';

const API_ROOT = (
  (import.meta as unknown as { env?: { VITE_GRAPHQL_HTTP?: string } }).env
    ?.VITE_GRAPHQL_HTTP ?? 'http://localhost:3000/graphql'
).replace(/\/graphql\/?$/, '');

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function attachmentIconFor(mime: string): string {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'picture_as_pdf';
  if (mime.startsWith('video/')) return 'videocam';
  if (mime.includes('spreadsheet') || mime.includes('excel')) return 'table_chart';
  if (mime.includes('word') || mime.includes('document')) return 'description';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'slideshow';
  return 'attach_file';
}

function mediaUploadKindFor(mime: string): 'image' | 'video' | 'other' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'other';
}

function sectionIcon(kind: ProjectSectionKind): string {
  switch (kind) {
    case 'VOLUNTEERS':
      return 'volunteer_activism';
    case 'ADMIN':
      return 'admin_panel_settings';
    case 'COMMUNICATION':
      return 'campaign';
    case 'LIVE':
      return 'sensors';
    case 'ACCOUNTING':
      return 'account_balance';
    default:
      return 'folder';
  }
}

/**
 * Affiche les sections d'un projet avec possibilité de renommer et
 * d'éditer le contenu en brut (textarea) — l'éditeur Tiptap riche viendra
 * dans un patch UX suivant, pour v1 on se contente d'une édition simple.
 */
export function ProjectSectionsTab({
  project,
}: {
  project: ClubProjectGraph;
}) {
  const { showToast } = useToast();
  const { data, loading } = useQuery<{
    clubProjectSections: ProjectSectionGraph[];
  }>(CLUB_PROJECT_SECTIONS, {
    variables: { projectId: project.id },
    fetchPolicy: 'cache-and-network',
  });
  const [rename] = useMutation(RENAME_PROJECT_SECTION, {
    refetchQueries: [
      {
        query: CLUB_PROJECT_SECTIONS,
        variables: { projectId: project.id },
      },
    ],
  });
  const [updateBody] = useMutation(UPDATE_PROJECT_SECTION_BODY, {
    refetchQueries: [
      {
        query: CLUB_PROJECT_SECTIONS,
        variables: { projectId: project.id },
      },
    ],
  });

  const sections = data?.clubProjectSections ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [editingBody, setEditingBody] = useState<{
    id: string;
    text: string;
  } | null>(null);

  async function handleRename() {
    if (!editingLabel) return;
    try {
      await rename({
        variables: {
          input: { id: editingLabel.id, label: editingLabel.label },
        },
      });
      setEditingLabel(null);
      showToast('Section renommée.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec du renommage',
        'error',
      );
    }
  }

  async function handleSaveBody() {
    if (!editingBody) return;
    // Convert plain text into a minimal Tiptap document structure.
    const paragraphs = editingBody.text
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
    const doc = {
      type: 'doc',
      content: paragraphs.map((p) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: p }],
      })),
    };
    try {
      await updateBody({
        variables: {
          input: { id: editingBody.id, bodyJson: JSON.stringify(doc) },
        },
      });
      setEditingBody(null);
      showToast('Contenu de section enregistré.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de l’enregistrement',
        'error',
      );
    }
  }

  function bodyToPlainText(bodyJson: string | null): string {
    if (!bodyJson) return '';
    try {
      const doc = JSON.parse(bodyJson) as {
        content?: Array<{
          content?: Array<{ type?: string; text?: string }>;
        }>;
      };
      return (doc.content ?? [])
        .map((p) =>
          (p.content ?? [])
            .map((c) => (c.type === 'text' ? (c.text ?? '') : ''))
            .join(''),
        )
        .join('\n\n');
    } catch {
      return '';
    }
  }

  if (loading && sections.length === 0) {
    return <p>Chargement des sections…</p>;
  }

  return (
    <div className="cf-project-sections">
      <p className="cf-text-muted">
        Les 4 sections de base sont créées automatiquement à la création du
        projet. Tu peux les renommer et modifier leur contenu.{' '}
        {sections.some((s) => s.kind === 'ACCOUNTING')
          ? 'La section Comptabilité est en lecture seule et reflète les écritures analytiques filtrées.'
          : ''}
      </p>
      <ul className="cf-project-sections__list">
        {sections.map((s) => {
          const expanded = expandedId === s.id;
          return (
            <li
              key={s.id}
              className={`cf-project-sections__item${
                expanded ? ' cf-project-sections__item--expanded' : ''
              }`}
            >
              <div className="cf-project-sections__header">
                <button
                  type="button"
                  className="cf-project-sections__toggle"
                  onClick={() =>
                    setExpandedId(expanded ? null : s.id)
                  }
                >
                  <span className="material-symbols-outlined" aria-hidden>
                    {sectionIcon(s.kind)}
                  </span>
                  {editingLabel?.id === s.id ? (
                    <input
                      type="text"
                      value={editingLabel.label}
                      onChange={(e) =>
                        setEditingLabel({
                          id: s.id,
                          label: e.target.value,
                        })
                      }
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleRename();
                        if (e.key === 'Escape') setEditingLabel(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <strong>{s.label}</strong>
                  )}
                  <span
                    className="material-symbols-outlined cf-project-sections__chevron"
                    aria-hidden
                  >
                    {expanded ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
                {editingLabel?.id === s.id ? (
                  <div className="cf-project-sections__inline-actions">
                    <button
                      type="button"
                      className="cf-btn cf-btn--sm"
                      onClick={handleRename}
                    >
                      OK
                    </button>
                    <button
                      type="button"
                      className="cf-btn cf-btn--sm cf-btn--ghost"
                      onClick={() => setEditingLabel(null)}
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="cf-btn cf-btn--sm cf-btn--ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingLabel({ id: s.id, label: s.label });
                    }}
                  >
                    Renommer
                  </button>
                )}
              </div>
              {expanded && (
                <div className="cf-project-sections__body">
                  {s.kind === 'ACCOUNTING' ? (
                    <p className="cf-text-muted">
                      Cette section affiche les écritures analytiques de ce
                      projet. Gérez-les depuis le module Comptabilité en
                      filtrant par projet.
                    </p>
                  ) : s.kind === 'LIVE' ? (
                    <p className="cf-text-muted">
                      Onglet dédié : voir <strong>Live</strong> pour les
                      phases et les items en modération.
                    </p>
                  ) : editingBody?.id === s.id ? (
                    <>
                      <textarea
                        value={editingBody.text}
                        onChange={(e) =>
                          setEditingBody({ id: s.id, text: e.target.value })
                        }
                        rows={8}
                        className="cf-textarea"
                        placeholder="Texte libre. Une ligne vide sépare les paragraphes."
                      />
                      <div className="cf-form__actions">
                        <button
                          type="button"
                          className="cf-btn cf-btn--ghost"
                          onClick={() => setEditingBody(null)}
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          className="cf-btn cf-btn--primary"
                          onClick={handleSaveBody}
                        >
                          Enregistrer
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {s.bodyJson ? (
                        <pre className="cf-project-sections__preview">
                          {bodyToPlainText(s.bodyJson)}
                        </pre>
                      ) : (
                        <p className="cf-text-muted">
                          Pas encore de contenu dans cette section.
                        </p>
                      )}
                      <button
                        type="button"
                        className="cf-btn"
                        onClick={() =>
                          setEditingBody({
                            id: s.id,
                            text: bodyToPlainText(s.bodyJson),
                          })
                        }
                      >
                        Modifier le contenu
                      </button>
                      <SectionAttachments sectionId={s.id} />
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SectionAttachments({ sectionId }: { sectionId: string }) {
  const { showToast } = useToast();
  const { data, loading, refetch } = useQuery<{
    projectSectionAttachments: ProjectSectionAttachmentGraph[];
  }>(PROJECT_SECTION_ATTACHMENTS, {
    variables: { sectionId },
    fetchPolicy: 'cache-and-network',
  });
  const [attach] = useMutation(ATTACH_PROJECT_SECTION_DOCUMENT, {
    refetchQueries: [
      { query: PROJECT_SECTION_ATTACHMENTS, variables: { sectionId } },
    ],
  });
  const [detach] = useMutation(DETACH_PROJECT_SECTION_DOCUMENT, {
    refetchQueries: [
      { query: PROJECT_SECTION_ATTACHMENTS, variables: { sectionId } },
    ],
  });
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const token = getToken();
    const clubId = getClubId();
    if (!token || !clubId) {
      showToast('Session expirée.', 'error');
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        const kind = mediaUploadKindFor(file.type);
        const res = await fetch(`${API_ROOT}/media/upload?kind=${kind}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Club-Id': clubId,
          },
          body: form,
        });
        if (!res.ok) {
          showToast(`Upload ${file.name} : HTTP ${res.status}`, 'error');
          continue;
        }
        const asset = (await res.json()) as { id: string };
        await attach({
          variables: { sectionId, mediaAssetId: asset.id },
        });
      }
      showToast('Document(s) ajouté(s).', 'success');
      e.target.value = '';
      void refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleDetach(attachmentId: string, name: string) {
    if (
      !window.confirm(
        `Retirer « ${name} » de cette section ? Le fichier reste dans la médiathèque.`,
      )
    ) {
      return;
    }
    try {
      await detach({
        variables: { sectionId, mediaAssetId: attachmentId },
      });
      showToast('Document retiré.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  const attachments = data?.projectSectionAttachments ?? [];

  return (
    <div className="cf-project-sections__attachments">
      <div className="cf-project-sections__attachments-head">
        <h4>
          <span className="material-symbols-outlined" aria-hidden>
            attach_file
          </span>
          Documents ({attachments.length})
        </h4>
        <label className="cf-btn cf-btn--sm">
          <span className="material-symbols-outlined" aria-hidden>
            upload
          </span>
          {uploading ? 'Envoi…' : 'Ajouter un document'}
          <input
            type="file"
            multiple
            onChange={handleUpload}
            disabled={uploading}
            hidden
          />
        </label>
      </div>
      {loading && attachments.length === 0 ? (
        <p className="cf-text-muted">Chargement…</p>
      ) : attachments.length === 0 ? (
        <p className="cf-text-muted">
          Aucun document. Ajoute PDF, images, affiches, feuilles de calcul
          utiles pour cette section.
        </p>
      ) : (
        <ul className="cf-project-sections__attachments-list">
          {attachments.map((a) => (
            <li key={a.id}>
              <a
                href={a.publicUrl ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="cf-project-sections__attachment"
              >
                <span className="material-symbols-outlined" aria-hidden>
                  {attachmentIconFor(a.mimeType)}
                </span>
                <div>
                  <strong>{a.fileName}</strong>
                  <small>
                    {fmtSize(a.sizeBytes)} ·{' '}
                    {new Date(a.uploadedAt).toLocaleDateString('fr-FR')}
                  </small>
                </div>
              </a>
              <button
                type="button"
                className="cf-btn cf-btn--sm cf-btn--ghost"
                onClick={() => handleDetach(a.id, a.fileName)}
                title="Retirer de cette section"
              >
                <span className="material-symbols-outlined" aria-hidden>
                  close
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
