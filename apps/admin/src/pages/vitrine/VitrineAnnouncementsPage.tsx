import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CLUB_VITRINE_ANNOUNCEMENTS,
  CREATE_VITRINE_ANNOUNCEMENT,
  DELETE_VITRINE_ANNOUNCEMENT,
  UPDATE_VITRINE_ANNOUNCEMENT,
  type ClubVitrineAnnouncementsData,
} from '../../lib/vitrine-documents';
import { useToast } from '../../components/ToastProvider';

export function VitrineAnnouncementsPage() {
  const { showToast } = useToast();
  const { data, loading, error } = useQuery<ClubVitrineAnnouncementsData>(
    CLUB_VITRINE_ANNOUNCEMENTS,
    { fetchPolicy: 'cache-and-network' },
  );
  const refetch = [{ query: CLUB_VITRINE_ANNOUNCEMENTS }];
  const [create, { loading: creating }] = useMutation(
    CREATE_VITRINE_ANNOUNCEMENT,
    { refetchQueries: refetch },
  );
  const [update] = useMutation(UPDATE_VITRINE_ANNOUNCEMENT, {
    refetchQueries: refetch,
  });
  const [remove] = useMutation(DELETE_VITRINE_ANNOUNCEMENT, {
    refetchQueries: refetch,
  });

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);

  async function handleCreate(): Promise<void> {
    if (!title.trim() || !body.trim()) {
      showToast('Titre et contenu requis', 'error');
      return;
    }
    try {
      await create({
        variables: {
          input: {
            title: title.trim(),
            body: body.trim(),
            pinned,
            publishNow: true,
          },
        },
      });
      setTitle('');
      setBody('');
      setPinned(false);
      showToast('Annonce publiée.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  const rows = data?.clubVitrineAnnouncements ?? [];

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">
              <Link to="/vitrine">← Site vitrine</Link>
            </p>
            <h1 className="members-loom__title">Annonces ({rows.length})</h1>
          </div>
        </div>
      </header>

      <section
        style={{
          border: '1px solid var(--border, #ddd)',
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Nouvelle annonce</h2>
        <label className="field">
          <span>Titre</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Corps</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
          />
        </label>
        <label className="field">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
            />
            Épingler en haut
          </span>
        </label>
        <button
          type="button"
          className="btn btn-tight"
          disabled={creating}
          onClick={() => void handleCreate()}
        >
          {creating ? 'Création…' : 'Publier'}
        </button>
      </section>

      {error ? (
        <p className="form-error">{error.message}</p>
      ) : loading && rows.length === 0 ? (
        <p className="muted">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="muted">Aucune annonce publiée.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {rows.map((a) => (
            <li
              key={a.id}
              style={{
                border: '1px solid var(--border, #ddd)',
                borderRadius: 8,
                padding: 16,
                marginBottom: 8,
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between' }}
              >
                <strong>
                  {a.pinned ? '📌 ' : ''}
                  {a.title}
                </strong>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-tight btn-ghost"
                    onClick={() =>
                      void update({
                        variables: {
                          input: { id: a.id, pinned: !a.pinned },
                        },
                      })
                    }
                  >
                    {a.pinned ? 'Désépingler' : 'Épingler'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-tight btn-ghost"
                    onClick={() => {
                      if (window.confirm(`Supprimer "${a.title}" ?`)) {
                        void remove({ variables: { id: a.id } });
                      }
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
              <p className="muted" style={{ marginTop: 8, whiteSpace: 'pre-line' }}>
                {a.body}
              </p>
              {a.publishedAt ? (
                <small className="muted">
                  Publiée le{' '}
                  {new Date(a.publishedAt).toLocaleDateString('fr-FR')}
                </small>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
