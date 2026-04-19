import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  CLOSE_CLUB_SURVEY,
  CLUB_SURVEYS,
  CREATE_CLUB_SURVEY,
  DELETE_CLUB_SURVEY,
  OPEN_CLUB_SURVEY,
} from '../../lib/documents';
import type {
  ClubSurvey,
  ClubSurveysQueryData,
  ClubSurveyStatusStr,
} from '../../lib/types';
import { useToast } from '../../components/ToastProvider';
import { ConfirmModal, Drawer, EmptyState } from '../../components/ui';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

function statusLabel(s: ClubSurveyStatusStr): string {
  if (s === 'DRAFT') return 'Brouillon';
  if (s === 'OPEN') return 'Ouvert';
  return 'Clôturé';
}

function statusTone(s: ClubSurveyStatusStr): 'ok' | 'warn' | 'muted' {
  if (s === 'OPEN') return 'ok';
  if (s === 'DRAFT') return 'warn';
  return 'muted';
}

export function SurveysTab() {
  const { showToast } = useToast();
  const { data, refetch, loading } = useQuery<ClubSurveysQueryData>(CLUB_SURVEYS);
  const [create, { loading: creating }] = useMutation(CREATE_CLUB_SURVEY);
  const [openMut] = useMutation(OPEN_CLUB_SURVEY);
  const [closeMut] = useMutation(CLOSE_CLUB_SURVEY);
  const [remove] = useMutation(DELETE_CLUB_SURVEY);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ClubSurvey | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multipleChoice, setMultipleChoice] = useState(false);
  const [allowAnonymous, setAllowAnonymous] = useState(false);
  const [publishNow, setPublishNow] = useState(true);

  const items = data?.clubSurveys ?? [];

  function openCreate() {
    setTitle('');
    setDescription('');
    setOptions(['', '']);
    setMultipleChoice(false);
    setAllowAnonymous(false);
    setPublishNow(true);
    setDrawerOpen(true);
  }

  function setOption(idx: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? value : o)));
  }
  function addOption() {
    setOptions((prev) => (prev.length < 20 ? [...prev, ''] : prev));
  }
  function removeOption(idx: number) {
    setOptions((prev) =>
      prev.length > 2 ? prev.filter((_, i) => i !== idx) : prev,
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cleaned = options.map((o) => o.trim()).filter((o) => o.length > 0);
    if (!title.trim() || cleaned.length < 2) {
      showToast('Titre et au moins 2 options requis', 'error');
      return;
    }
    try {
      await create({
        variables: {
          input: {
            title: title.trim(),
            description: description.trim() || undefined,
            options: cleaned,
            multipleChoice,
            allowAnonymous,
            publishNow,
          },
        },
      });
      showToast(publishNow ? 'Sondage publié' : 'Brouillon créé', 'success');
      setDrawerOpen(false);
      await refetch();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Erreur lors de l’enregistrement',
        'error',
      );
    }
  }

  async function onOpen(s: ClubSurvey) {
    try {
      await openMut({ variables: { id: s.id } });
      showToast('Sondage ouvert aux votes', 'success');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }
  async function onClose(s: ClubSurvey) {
    try {
      await closeMut({ variables: { id: s.id } });
      showToast('Sondage clôturé', 'success');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }
  async function onDelete() {
    if (!confirmDelete) return;
    try {
      await remove({ variables: { id: confirmDelete.id } });
      showToast('Sondage supprimé', 'success');
      setConfirmDelete(null);
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  return (
    <div className="cf-club-life">
      <div className="cf-club-life__toolbar">
        <button
          type="button"
          className="cf-btn cf-btn--primary"
          onClick={openCreate}
        >
          <span className="material-symbols-outlined" aria-hidden>
            add
          </span>
          Nouveau sondage
        </button>
      </div>

      {loading && items.length === 0 ? (
        <p className="cf-muted">Chargement…</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon="ballot"
          title="Aucun sondage"
          message="Recueillez l’avis des membres en quelques clics."
          action={
            <button
              type="button"
              className="cf-btn cf-btn--primary"
              onClick={openCreate}
            >
              Nouveau sondage
            </button>
          }
        />
      ) : (
        <ul className="cf-survey-list">
          {items.map((s) => {
            const total = s.totalResponses;
            return (
              <li key={s.id} className="cf-survey-card">
                <div className="cf-survey-card__head">
                  <h3 className="cf-survey-card__title">{s.title}</h3>
                  <span className={`cf-pill cf-pill--${statusTone(s.status)}`}>
                    {statusLabel(s.status)}
                  </span>
                </div>
                {s.description ? (
                  <p className="cf-survey-card__desc">{s.description}</p>
                ) : null}
                <ul className="cf-survey-options">
                  {s.options.map((o) => {
                    const pct =
                      total > 0 ? Math.round((o.responseCount / total) * 100) : 0;
                    return (
                      <li key={o.id} className="cf-survey-option">
                        <div className="cf-survey-option__row">
                          <span className="cf-survey-option__label">
                            {o.label}
                          </span>
                          <span className="cf-survey-option__count">
                            {o.responseCount} · {pct}%
                          </span>
                        </div>
                        <div className="cf-survey-option__bar">
                          <div
                            className="cf-survey-option__bar-fill"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="cf-survey-card__meta">
                  <span>{total} réponse{total > 1 ? 's' : ''}</span>
                  {s.publishedAt ? (
                    <span>Publié : {formatDate(s.publishedAt)}</span>
                  ) : null}
                  {s.multipleChoice ? <span>Choix multiples</span> : null}
                  {s.allowAnonymous ? <span>Anonyme autorisé</span> : null}
                </div>
                <div className="cf-survey-card__actions">
                  {s.status === 'DRAFT' ? (
                    <button
                      type="button"
                      className="cf-btn cf-btn--primary"
                      onClick={() => void onOpen(s)}
                    >
                      Ouvrir aux votes
                    </button>
                  ) : null}
                  {s.status === 'OPEN' ? (
                    <button
                      type="button"
                      className="cf-btn"
                      onClick={() => void onClose(s)}
                    >
                      Clôturer
                    </button>
                  ) : null}
                  {s.status === 'CLOSED' ? (
                    <button
                      type="button"
                      className="cf-btn"
                      onClick={() => void onOpen(s)}
                    >
                      Rouvrir
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="cf-btn cf-btn--danger"
                    onClick={() => setConfirmDelete(s)}
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Drawer
        open={drawerOpen}
        title="Nouveau sondage"
        onClose={() => setDrawerOpen(false)}
      >
        <form onSubmit={(e) => void onSubmit(e)} className="cf-form">
          <label className="cf-field">
            <span className="cf-field__label">Titre</span>
            <input
              type="text"
              className="cf-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
            />
          </label>
          <label className="cf-field">
            <span className="cf-field__label">Description (optionnel)</span>
            <textarea
              className="cf-input cf-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={5000}
            />
          </label>
          <div className="cf-field">
            <span className="cf-field__label">Options (2 à 20)</span>
            <ul className="cf-survey-options-editor">
              {options.map((opt, i) => (
                <li key={i} className="cf-survey-options-editor__row">
                  <input
                    type="text"
                    className="cf-input"
                    value={opt}
                    onChange={(e) => setOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    maxLength={200}
                  />
                  <button
                    type="button"
                    className="cf-btn cf-btn--ghost"
                    onClick={() => removeOption(i)}
                    disabled={options.length <= 2}
                    aria-label="Retirer l’option"
                  >
                    <span className="material-symbols-outlined" aria-hidden>
                      remove
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="cf-btn"
              onClick={addOption}
              disabled={options.length >= 20}
            >
              <span className="material-symbols-outlined" aria-hidden>
                add
              </span>
              Ajouter une option
            </button>
          </div>
          <label className="cf-checkbox">
            <input
              type="checkbox"
              checked={multipleChoice}
              onChange={(e) => setMultipleChoice(e.target.checked)}
            />
            <span>Autoriser plusieurs choix</span>
          </label>
          <label className="cf-checkbox">
            <input
              type="checkbox"
              checked={allowAnonymous}
              onChange={(e) => setAllowAnonymous(e.target.checked)}
            />
            <span>Autoriser les réponses anonymes</span>
          </label>
          <label className="cf-checkbox">
            <input
              type="checkbox"
              checked={publishNow}
              onChange={(e) => setPublishNow(e.target.checked)}
            />
            <span>Ouvrir aux votes immédiatement</span>
          </label>
          <div className="cf-form-actions">
            <button
              type="button"
              className="cf-btn"
              onClick={() => setDrawerOpen(false)}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="cf-btn cf-btn--primary"
              disabled={creating}
            >
              {publishNow ? 'Publier' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </Drawer>

      <ConfirmModal
        open={confirmDelete !== null}
        title="Supprimer le sondage ?"
        message={`Le sondage « ${confirmDelete?.title ?? ''} » et toutes les réponses seront supprimés.`}
        confirmLabel="Supprimer"
        danger
        onConfirm={() => void onDelete()}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
