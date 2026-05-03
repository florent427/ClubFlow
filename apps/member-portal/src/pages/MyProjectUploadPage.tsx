import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getApiBaseUrl } from '../lib/api-base';
import { getClubId, getToken } from '../lib/storage';
import {
  DELETE_MY_PROJECT_LIVE_ITEM,
  MY_PROJECT_CONTRIBUTIONS,
  MY_PROJECT_LIVE_ITEMS,
  MY_PROJECT_LIVE_ITEM_QUOTA,
  MY_PROJECT_PHASES,
  SUBMIT_PROJECT_LIVE_ITEM,
  type LiveItemQuotaInfo,
  type MyProjectGraph,
  type MyProjectLiveItem,
  type MyProjectPhase,
  type ProjectLiveItemKind,
  type ProjectLivePhaseState,
} from '../lib/projects-documents';
import { useToast } from '../components/ToastProvider';

function decisionLabel(
  item: MyProjectLiveItem,
): { label: string; cls: string } {
  if (item.humanDecision === 'APPROVED') {
    return { label: 'Validé', cls: 'success' };
  }
  if (item.humanDecision === 'REJECTED') {
    return { label: 'Rejeté', cls: 'danger' };
  }
  if (item.aiDecision === 'REJECTED') {
    return { label: 'IA a rejeté', cls: 'warning' };
  }
  if (item.aiDecision === 'ERROR') {
    return { label: 'IA indisponible', cls: 'warning' };
  }
  return { label: 'En attente de revue', cls: 'neutral' };
}

function phaseStateLabel(s: ProjectLivePhaseState): string {
  if (s === 'UPCOMING') return 'À venir';
  if (s === 'LIVE') return 'Ouverte';
  return 'Fermée';
}

function phaseStateClass(s: ProjectLivePhaseState): string {
  if (s === 'UPCOMING') return 'neutral';
  if (s === 'LIVE') return 'success';
  return 'info';
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function MyProjectUploadPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId ?? '';
  const { showToast } = useToast();

  const contribsQuery = useQuery<{
    myProjectContributions: MyProjectGraph[];
  }>(MY_PROJECT_CONTRIBUTIONS);
  const quotaQuery = useQuery<{
    myProjectLiveItemQuota: LiveItemQuotaInfo;
  }>(MY_PROJECT_LIVE_ITEM_QUOTA, {
    variables: { projectId },
    skip: !projectId,
    fetchPolicy: 'cache-and-network',
  });
  const phasesQuery = useQuery<{
    myProjectPhases: MyProjectPhase[];
  }>(MY_PROJECT_PHASES, {
    variables: { projectId },
    skip: !projectId,
    fetchPolicy: 'cache-and-network',
  });
  const itemsQuery = useQuery<{
    myProjectLiveItems: MyProjectLiveItem[];
  }>(MY_PROJECT_LIVE_ITEMS, {
    variables: { projectId },
    skip: !projectId,
    fetchPolicy: 'cache-and-network',
  });

  const [submit] = useMutation(SUBMIT_PROJECT_LIVE_ITEM, {
    refetchQueries: [
      { query: MY_PROJECT_LIVE_ITEMS, variables: { projectId } },
      { query: MY_PROJECT_LIVE_ITEM_QUOTA, variables: { projectId } },
    ],
  });
  const [deleteItem] = useMutation(DELETE_MY_PROJECT_LIVE_ITEM, {
    refetchQueries: [
      { query: MY_PROJECT_LIVE_ITEMS, variables: { projectId } },
      { query: MY_PROJECT_LIVE_ITEM_QUOTA, variables: { projectId } },
    ],
  });

  const [uploading, setUploading] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [submittingText, setSubmittingText] = useState(false);

  const project = contribsQuery.data?.myProjectContributions.find(
    (p) => p.id === projectId,
  );
  const quota = quotaQuery.data?.myProjectLiveItemQuota;
  const phases = phasesQuery.data?.myProjectPhases ?? [];
  const items = itemsQuery.data?.myProjectLiveItems ?? [];

  async function uploadAsset(file: File, kind: ProjectLiveItemKind) {
    const token = getToken();
    const clubId = getClubId();
    if (!token || !clubId) {
      showToast('Session expirée.', 'error');
      return null;
    }
    const form = new FormData();
    form.append('file', file);
    const uploadKind = kind === 'PHOTO' ? 'image' : 'video';
    const res = await fetch(
      `${getApiBaseUrl()}/media/upload?kind=${uploadKind}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Club-Id': clubId,
        },
        body: form,
      },
    );
    if (!res.ok) {
      throw new Error(
        `Upload ${file.name} : HTTP ${res.status} — vérifie la taille / le format.`,
      );
    }
    return (await res.json()) as { id: string };
  }

  async function handleFile(
    e: ChangeEvent<HTMLInputElement>,
    kind: ProjectLiveItemKind,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const asset = await uploadAsset(file, kind);
      if (!asset) return;
      await submit({
        variables: {
          input: { projectId, kind, mediaAssetId: asset.id },
        },
      });
      showToast(`${kind === 'PHOTO' ? 'Photo' : 'Vidéo'} soumise.`, 'success');
      e.target.value = '';
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de l’envoi',
        'error',
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmitText() {
    const text = textDraft.trim();
    if (!text) {
      showToast('Écris d’abord quelque chose avant d’envoyer.', 'error');
      return;
    }
    if (text.length > 4000) {
      showToast('Trop long : maximum 4000 caractères.', 'error');
      return;
    }
    setSubmittingText(true);
    try {
      await submit({
        variables: {
          input: { projectId, kind: 'TEXT', textContent: text },
        },
      });
      showToast('Texte soumis. Il passera en revue admin.', 'success');
      setTextDraft('');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de l’envoi du texte',
        'error',
      );
    } finally {
      setSubmittingText(false);
    }
  }

  async function handleDelete(itemId: string) {
    if (
      !window.confirm(
        'Supprimer ce media ? Ton slot de quota sera libéré et tu pourras en reposter un nouveau.',
      )
    ) {
      return;
    }
    try {
      await deleteItem({ variables: { id: itemId } });
      showToast('Media supprimé.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de la suppression',
        'error',
      );
    }
  }

  if (!project) {
    return (
      <div className="mp-page">
        <p>
          Projet introuvable ou tu n’es pas contributeur·ice.{' '}
          <Link to="/mes-projets">Retour à la liste</Link>
        </p>
      </div>
    );
  }

  const phaseIsLive = quota?.phaseIsLive ?? false;
  const photosRemaining = quota
    ? Math.max(0, quota.maxPhotos - quota.usedPhotos)
    : project.maxPhotosPerContributorPerPhase;
  const videosRemaining = quota
    ? Math.max(0, quota.maxVideos - quota.usedVideos)
    : project.maxVideosPerContributorPerPhase;
  const textsRemaining = quota
    ? Math.max(0, quota.maxTexts - quota.usedTexts)
    : project.maxTextsPerContributorPerPhase;

  // Quota ne s'applique que pendant une phase LIVE. Hors phase, uploads
  // libres (mode ajout tardif).
  const canUploadPhoto = !phaseIsLive || photosRemaining > 0;
  const canUploadVideo = !phaseIsLive || videosRemaining > 0;
  const canSubmitText = !phaseIsLive || textsRemaining > 0;

  return (
    <div className="mp-page mp-project-upload">
      <Link to="/mes-projets" className="mp-back-link">
        <span className="material-symbols-outlined" aria-hidden>
          arrow_back
        </span>
        Mes projets
      </Link>
      {project.coverImageUrl && (
        <div className="mp-project-upload__cover">
          <img
            src={project.coverImageUrl}
            alt={`Miniature ${project.title}`}
          />
        </div>
      )}
      <header className="mp-page__header">
        <h1>{project.title}</h1>
        {project.summary && (
          <p className="mp-page__subtitle">{project.summary}</p>
        )}
      </header>

      {/* Phases du projet (toutes) */}
      <section className="mp-card">
        <h2>
          <span className="material-symbols-outlined" aria-hidden>
            schedule
          </span>
          Phases du projet
        </h2>
        {phases.length === 0 ? (
          <p className="mp-text-muted">
            Aucune phase planifiée pour l’instant. Tu peux quand même
            uploader tes médias — ils seront marqués comme « ajout tardif »
            et vérifiés par l’admin.
          </p>
        ) : (
          <ul className="mp-project-upload__phases">
            {phases.map((ph) => (
              <li
                key={ph.id}
                className={`mp-project-upload__phase mp-project-upload__phase--${ph.state.toLowerCase()}`}
              >
                <div>
                  <strong>{ph.label}</strong>
                  <small>
                    {fmtDateTime(ph.startsAt)} → {fmtDateTime(ph.endsAt)}
                  </small>
                </div>
                <span
                  className={`mp-badge mp-badge--${phaseStateClass(ph.state)}`}
                >
                  {phaseStateLabel(ph.state)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Quota / état upload */}
      {phaseIsLive ? (
        <section className="mp-card mp-project-upload__quota">
          <h2>
            <span className="material-symbols-outlined" aria-hidden>
              sensors
            </span>
            Phase live : {quota?.phaseLabel}
          </h2>
          <div className="mp-project-upload__quota-grid">
            <div>
              <strong>
                {photosRemaining} / {quota?.maxPhotos}
              </strong>
              <small>photos restantes</small>
            </div>
            <div>
              <strong>
                {videosRemaining} / {quota?.maxVideos}
              </strong>
              <small>vidéos restantes</small>
            </div>
            <div>
              <strong>
                {textsRemaining} / {quota?.maxTexts}
              </strong>
              <small>textes restants</small>
            </div>
          </div>
          <p className="mp-text-muted">
            Ton quota se libère automatiquement si un admin rejette une de
            tes soumissions, ou si tu la supprimes toi-même.
          </p>
        </section>
      ) : (
        <section className="mp-card mp-project-upload__quota mp-project-upload__quota--offphase">
          <h2>
            <span className="material-symbols-outlined" aria-hidden>
              info
            </span>
            Upload hors phase
          </h2>
          <p className="mp-text-muted">
            Aucune phase LIVE n’est ouverte actuellement. Tes uploads seront
            marqués comme <strong>ajout tardif</strong> et pourront être
            utilisés par l’admin pour compléter les comptes-rendus. Pas de
            quota dans ce mode.
          </p>
        </section>
      )}

      {/* Boutons upload — toujours visibles */}
      <section className="mp-card mp-project-upload__actions">
        <h2>Ajouter une soumission</h2>
        <div className="mp-project-upload__buttons">
          <label
            className={`mp-btn mp-btn--primary${
              !canUploadPhoto || uploading ? ' mp-btn--disabled' : ''
            }`}
          >
            <span className="material-symbols-outlined" aria-hidden>
              photo_camera
            </span>
            {uploading ? 'Envoi…' : 'Photo'}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleFile(e, 'PHOTO')}
              disabled={uploading || !canUploadPhoto}
              hidden
            />
          </label>
          <label
            className={`mp-btn${
              !canUploadVideo || uploading ? ' mp-btn--disabled' : ''
            }`}
          >
            <span className="material-symbols-outlined" aria-hidden>
              videocam
            </span>
            {uploading ? 'Envoi…' : 'Vidéo courte'}
            <input
              type="file"
              accept="video/*"
              onChange={(e) => handleFile(e, 'VIDEO')}
              disabled={uploading || !canUploadVideo}
              hidden
            />
          </label>
        </div>
        {phaseIsLive && !canUploadPhoto && (
          <p className="mp-text-warning">
            Quota photos atteint pour cette phase. Supprime une soumission
            existante pour libérer un slot.
          </p>
        )}
        {phaseIsLive && !canUploadVideo && (
          <p className="mp-text-warning">Quota vidéos atteint.</p>
        )}

        <div className="mp-project-upload__text">
          <h3>
            <span className="material-symbols-outlined" aria-hidden>
              edit_note
            </span>
            Écrire un texte
          </h3>
          <p className="mp-text-muted">
            Témoignage, anecdote, légende pour une photo, citation d’athlète…
            utilisé par l’admin pour enrichir les comptes-rendus.
          </p>
          <textarea
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            placeholder="Raconte en quelques phrases…"
            rows={5}
            maxLength={4000}
            disabled={submittingText || !canSubmitText}
            className="mp-textarea"
          />
          <div className="mp-project-upload__text-footer">
            <small>{textDraft.length} / 4000 caractères</small>
            <button
              type="button"
              className="mp-btn mp-btn--primary"
              onClick={handleSubmitText}
              disabled={
                submittingText || !canSubmitText || textDraft.trim().length === 0
              }
            >
              {submittingText ? 'Envoi…' : 'Envoyer le texte'}
            </button>
          </div>
          {phaseIsLive && !canSubmitText && (
            <p className="mp-text-warning">
              Quota textes atteint. Supprime un texte existant pour libérer
              un slot.
            </p>
          )}
        </div>
      </section>

      {/* Liste des items */}
      <section>
        <h2>Mes soumissions ({items.length})</h2>
        {items.length === 0 ? (
          <p className="mp-text-muted">Tu n’as rien soumis sur ce projet.</p>
        ) : (
          <ul className="mp-project-upload__items">
            {items.map((item) => {
              const decision = decisionLabel(item);
              return (
                <li key={item.id} className="mp-card">
                  {item.kind === 'TEXT' ? (
                    <div className="mp-project-upload__item-text">
                      <span
                        className="material-symbols-outlined"
                        aria-hidden
                      >
                        format_quote
                      </span>
                      <blockquote>{item.textContent}</blockquote>
                    </div>
                  ) : item.mediaAsset?.publicUrl &&
                    item.mediaAsset.mimeType.startsWith('image/') ? (
                    <img src={item.mediaAsset.publicUrl} alt="" />
                  ) : item.mediaAsset?.publicUrl ? (
                    <video
                      src={item.mediaAsset.publicUrl}
                      controls
                      preload="metadata"
                    />
                  ) : (
                    <div className="mp-project-upload__item-placeholder">
                      <span className="material-symbols-outlined" aria-hidden>
                        broken_image
                      </span>
                    </div>
                  )}
                  <div className="mp-project-upload__item-body">
                    <div className="mp-project-upload__item-badges">
                      <span
                        className={`mp-badge mp-badge--${decision.cls}`}
                      >
                        {decision.label}
                      </span>
                      {!item.submittedDuringLive && (
                        <span className="mp-badge mp-badge--warning">
                          Ajout tardif
                        </span>
                      )}
                    </div>
                    {item.aiReason && (
                      <p className="mp-text-warning">
                        Motif IA : {item.aiReason}
                      </p>
                    )}
                    <small>
                      Envoyé le{' '}
                      {new Date(item.submittedAt).toLocaleString('fr-FR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </small>
                    {item.humanDecision !== 'REJECTED' && (
                      <button
                        type="button"
                        className="mp-btn mp-btn--sm mp-btn--ghost"
                        onClick={() => handleDelete(item.id)}
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
