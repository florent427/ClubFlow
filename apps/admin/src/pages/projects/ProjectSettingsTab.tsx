import { useMutation } from '@apollo/client/react';
import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  CLUB_PROJECT,
  CLUB_PROJECTS,
  UPDATE_CLUB_PROJECT,
  type ClubProjectGraph,
  type ProjectStatus,
} from '../../lib/projects-documents';
import { useToast } from '../../components/ToastProvider';
import { getClubId, getToken } from '../../lib/storage';

const API_ROOT = (
  (import.meta as unknown as { env?: { VITE_GRAPHQL_HTTP?: string } }).env
    ?.VITE_GRAPHQL_HTTP ?? 'http://localhost:3000/graphql'
).replace(/\/graphql\/?$/, '');

function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ProjectSettingsTab({
  project,
  onChange,
}: {
  project: ClubProjectGraph;
  onChange: () => void;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState({
    title: project.title,
    summary: project.summary ?? '',
    description: project.description ?? '',
    startsAt: toDateInput(project.startsAt),
    endsAt: toDateInput(project.endsAt),
    budgetPlannedCents: project.budgetPlannedCents ?? 0,
    maxPhotos: project.maxPhotosPerContributorPerPhase,
    maxVideos: project.maxVideosPerContributorPerPhase,
    maxTexts: project.maxTextsPerContributorPerPhase,
    showContributorCredits: project.showContributorCredits,
    status: project.status,
  });

  const [update, { loading }] = useMutation(UPDATE_CLUB_PROJECT, {
    refetchQueries: [
      { query: CLUB_PROJECTS },
      { query: CLUB_PROJECT, variables: { id: project.id } },
    ],
  });
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  async function handleCoverUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const token = getToken();
    const clubId = getClubId();
    if (!token || !clubId) {
      showToast('Session expirée.', 'error');
      return;
    }
    setUploadingCover(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_ROOT}/media/upload?kind=image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Club-Id': clubId,
        },
        body: form,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const asset = (await res.json()) as { id: string };
      await update({
        variables: {
          input: { id: project.id, coverImageId: asset.id },
        },
      });
      onChange();
      showToast('Miniature mise à jour.', 'success');
      if (coverInputRef.current) coverInputRef.current.value = '';
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de l’upload',
        'error',
      );
    } finally {
      setUploadingCover(false);
    }
  }

  async function handleCoverRemove() {
    if (!window.confirm('Retirer la miniature du projet ?')) return;
    try {
      await update({
        variables: {
          input: { id: project.id, coverImageId: null },
        },
      });
      onChange();
      showToast('Miniature retirée.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Erreur',
        'error',
      );
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    try {
      await update({
        variables: {
          input: {
            id: project.id,
            title: form.title,
            summary: form.summary || null,
            description: form.description || null,
            startsAt: form.startsAt ? new Date(form.startsAt) : null,
            endsAt: form.endsAt ? new Date(form.endsAt) : null,
            budgetPlannedCents: form.budgetPlannedCents || null,
            maxPhotosPerContributorPerPhase: form.maxPhotos,
            maxVideosPerContributorPerPhase: form.maxVideos,
            maxTextsPerContributorPerPhase: form.maxTexts,
            showContributorCredits: form.showContributorCredits,
            status: form.status,
          },
        },
      });
      onChange();
      showToast('Projet enregistré.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de l’enregistrement',
        'error',
      );
    }
  }

  return (
    <form onSubmit={handleSave} className="cf-project-settings">
      <div className="cf-card">
        <h3>Miniature du projet</h3>
        <p className="cf-text-muted">
          Image représentative affichée dans la liste des projets (admin et
          espace membre) + bandeau en tête de la page projet. Format
          recommandé : 16:9, minimum 800 × 450 px.
        </p>
        <div className="cf-project-settings__cover">
          {project.coverImageUrl ? (
            <img
              src={project.coverImageUrl}
              alt={`Miniature ${project.title}`}
              className="cf-project-settings__cover-preview"
            />
          ) : (
            <div className="cf-project-settings__cover-empty">
              <span className="material-symbols-outlined" aria-hidden>
                image
              </span>
              <span>Pas encore de miniature</span>
            </div>
          )}
          <div className="cf-project-settings__cover-actions">
            <label className="cf-btn cf-btn--primary">
              <span className="material-symbols-outlined" aria-hidden>
                upload
              </span>
              {uploadingCover
                ? 'Envoi…'
                : project.coverImageUrl
                  ? 'Remplacer'
                  : 'Ajouter une miniature'}
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                onChange={handleCoverUpload}
                disabled={uploadingCover}
                hidden
              />
            </label>
            {project.coverImageUrl && (
              <button
                type="button"
                className="cf-btn cf-btn--ghost cf-btn--danger"
                onClick={handleCoverRemove}
                disabled={uploadingCover}
              >
                Retirer
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="cf-card">
        <h3>Informations générales</h3>
        <label>
          Titre
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
            maxLength={200}
          />
        </label>
        <label>
          Pitch (1 ligne)
          <input
            type="text"
            value={form.summary}
            onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
            maxLength={500}
          />
        </label>
        <label>
          Description
          <textarea
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            rows={5}
            maxLength={10_000}
          />
        </label>
        <div className="cf-form__row">
          <label>
            Début
            <input
              type="date"
              value={form.startsAt}
              onChange={(e) =>
                setForm((f) => ({ ...f, startsAt: e.target.value }))
              }
            />
          </label>
          <label>
            Fin
            <input
              type="date"
              value={form.endsAt}
              onChange={(e) =>
                setForm((f) => ({ ...f, endsAt: e.target.value }))
              }
            />
          </label>
          <label>
            Statut
            <select
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  status: e.target.value as ProjectStatus,
                }))
              }
            >
              <option value="PLANNED">Planifié</option>
              <option value="ACTIVE">En cours</option>
              <option value="CLOSED">Clos</option>
              <option value="ARCHIVED">Archivé</option>
            </select>
          </label>
        </div>
      </div>

      <div className="cf-card">
        <h3>Quotas contributeurs (par phase LIVE)</h3>
        <div className="cf-form__row">
          <label>
            Photos max par contributeur
            <input
              type="number"
              min={0}
              max={100}
              value={form.maxPhotos}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  maxPhotos: parseInt(e.target.value, 10) || 0,
                }))
              }
            />
          </label>
          <label>
            Vidéos max par contributeur
            <input
              type="number"
              min={0}
              max={50}
              value={form.maxVideos}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  maxVideos: parseInt(e.target.value, 10) || 0,
                }))
              }
            />
          </label>
          <label>
            Textes max par contributeur
            <input
              type="number"
              min={0}
              max={100}
              value={form.maxTexts}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  maxTexts: parseInt(e.target.value, 10) || 0,
                }))
              }
            />
          </label>
        </div>
        <p className="cf-text-muted">
          Un item rejeté (IA ou admin) libère un slot. Par défaut 10 photos +
          3 vidéos + 20 textes par phase.
        </p>
      </div>

      <div className="cf-card">
        <h3>Publication & crédits</h3>
        <label className="cf-checkbox">
          <input
            type="checkbox"
            checked={form.showContributorCredits}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                showContributorCredits: e.target.checked,
              }))
            }
          />
          <span>
            Afficher les noms des contributeurs en fin de compte-rendu publié
          </span>
        </label>
      </div>

      <div className="cf-card">
        <h3>Budget</h3>
        <label>
          Budget prévisionnel (en centimes d’euros)
          <input
            type="number"
            min={0}
            value={form.budgetPlannedCents}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                budgetPlannedCents: parseInt(e.target.value, 10) || 0,
              }))
            }
          />
        </label>
        <p className="cf-text-muted">
          Les écritures analytiques sont gérées dans le module Comptabilité
          quand il est activé sur le club.
        </p>
      </div>

      <div className="cf-form__actions">
        <button
          type="submit"
          className="cf-btn cf-btn--primary"
          disabled={loading}
        >
          {loading ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}
