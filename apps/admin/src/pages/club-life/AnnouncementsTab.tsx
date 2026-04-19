import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  CLUB_ANNOUNCEMENTS,
  CREATE_CLUB_ANNOUNCEMENT,
  DELETE_CLUB_ANNOUNCEMENT,
  PUBLISH_CLUB_ANNOUNCEMENT,
  UPDATE_CLUB_ANNOUNCEMENT,
} from '../../lib/documents';
import type {
  ClubAnnouncement,
  ClubAnnouncementsQueryData,
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

export function AnnouncementsTab() {
  const { showToast } = useToast();
  const { data, refetch, loading } = useQuery<ClubAnnouncementsQueryData>(
    CLUB_ANNOUNCEMENTS,
  );
  const [create, { loading: creating }] = useMutation(CREATE_CLUB_ANNOUNCEMENT);
  const [update, { loading: updating }] = useMutation(UPDATE_CLUB_ANNOUNCEMENT);
  const [publish] = useMutation(PUBLISH_CLUB_ANNOUNCEMENT);
  const [remove] = useMutation(DELETE_CLUB_ANNOUNCEMENT);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ClubAnnouncement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ClubAnnouncement | null>(
    null,
  );
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [publishNow, setPublishNow] = useState(true);

  const items = data?.clubAnnouncements ?? [];

  function openCreate() {
    setEditing(null);
    setTitle('');
    setBody('');
    setPinned(false);
    setPublishNow(true);
    setDrawerOpen(true);
  }

  function openEdit(a: ClubAnnouncement) {
    setEditing(a);
    setTitle(a.title);
    setBody(a.body);
    setPinned(a.pinned);
    setPublishNow(true);
    setDrawerOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    try {
      if (editing) {
        await update({
          variables: {
            input: {
              id: editing.id,
              title: title.trim(),
              body: body.trim(),
              pinned,
            },
          },
        });
        showToast('Annonce mise à jour', 'success');
      } else {
        await create({
          variables: {
            input: {
              title: title.trim(),
              body: body.trim(),
              pinned,
              publishNow,
            },
          },
        });
        showToast(
          publishNow ? 'Annonce publiée' : 'Brouillon enregistré',
          'success',
        );
      }
      setDrawerOpen(false);
      await refetch();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Erreur lors de l’enregistrement',
        'error',
      );
    }
  }

  async function onPublish(a: ClubAnnouncement) {
    try {
      await publish({ variables: { id: a.id } });
      showToast('Annonce publiée', 'success');
      await refetch();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Erreur de publication',
        'error',
      );
    }
  }

  async function onDelete() {
    if (!confirmDelete) return;
    try {
      await remove({ variables: { id: confirmDelete.id } });
      showToast('Annonce supprimée', 'success');
      setConfirmDelete(null);
      await refetch();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Erreur de suppression',
        'error',
      );
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
          Nouvelle annonce
        </button>
      </div>

      {loading && items.length === 0 ? (
        <p className="cf-muted">Chargement…</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon="campaign"
          title="Aucune annonce"
          message="Publiez une information importante à tout le club."
          action={
            <button
              type="button"
              className="cf-btn cf-btn--primary"
              onClick={openCreate}
            >
              Nouvelle annonce
            </button>
          }
        />
      ) : (
        <ul className="cf-announcement-list">
          {items.map((a) => (
            <li
              key={a.id}
              className={`cf-announcement-card${
                a.pinned ? ' cf-announcement-card--pinned' : ''
              }`}
            >
              <div className="cf-announcement-card__head">
                <h3 className="cf-announcement-card__title">
                  {a.pinned ? (
                    <span
                      className="material-symbols-outlined"
                      aria-label="Épinglée"
                      title="Épinglée"
                    >
                      push_pin
                    </span>
                  ) : null}
                  {a.title}
                </h3>
                <span
                  className={`cf-pill cf-pill--${
                    a.publishedAt ? 'ok' : 'warn'
                  }`}
                >
                  {a.publishedAt ? 'Publiée' : 'Brouillon'}
                </span>
              </div>
              <p className="cf-announcement-card__body">{a.body}</p>
              <div className="cf-announcement-card__meta">
                <span>Créée : {formatDate(a.createdAt)}</span>
                {a.publishedAt ? (
                  <span>Publiée : {formatDate(a.publishedAt)}</span>
                ) : null}
              </div>
              <div className="cf-announcement-card__actions">
                {!a.publishedAt ? (
                  <button
                    type="button"
                    className="cf-btn cf-btn--primary"
                    onClick={() => void onPublish(a)}
                  >
                    Publier
                  </button>
                ) : null}
                <button
                  type="button"
                  className="cf-btn"
                  onClick={() => openEdit(a)}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  className="cf-btn cf-btn--danger"
                  onClick={() => setConfirmDelete(a)}
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={drawerOpen}
        title={editing ? 'Modifier l’annonce' : 'Nouvelle annonce'}
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
            <span className="cf-field__label">Message</span>
            <textarea
              className="cf-input cf-textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              rows={8}
              maxLength={20000}
            />
          </label>
          <label className="cf-checkbox">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
            />
            <span>Épingler en haut du fil</span>
          </label>
          {!editing ? (
            <label className="cf-checkbox">
              <input
                type="checkbox"
                checked={publishNow}
                onChange={(e) => setPublishNow(e.target.checked)}
              />
              <span>Publier immédiatement</span>
            </label>
          ) : null}
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
              disabled={creating || updating}
            >
              {editing ? 'Enregistrer' : publishNow ? 'Publier' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </Drawer>

      <ConfirmModal
        open={confirmDelete !== null}
        title="Supprimer l’annonce ?"
        message={`L’annonce « ${confirmDelete?.title ?? ''} » sera définitivement supprimée.`}
        confirmLabel="Supprimer"
        danger
        onConfirm={() => void onDelete()}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
