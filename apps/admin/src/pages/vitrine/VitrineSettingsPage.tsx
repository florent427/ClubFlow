import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CLUB_VITRINE_SETTINGS,
  UPDATE_VITRINE_SETTINGS,
  type ClubVitrineSettingsData,
} from '../../lib/vitrine-documents';
import { useToast } from '../../components/ToastProvider';

export function VitrineSettingsPage() {
  const { showToast } = useToast();
  const { data, loading, error } = useQuery<ClubVitrineSettingsData>(
    CLUB_VITRINE_SETTINGS,
    { fetchPolicy: 'cache-and-network' },
  );
  const [save, { loading: saving }] = useMutation(UPDATE_VITRINE_SETTINGS, {
    refetchQueries: [{ query: CLUB_VITRINE_SETTINGS }],
  });

  const [customDomain, setCustomDomain] = useState<string>('');
  const [vitrinePublished, setVitrinePublished] = useState<boolean>(false);

  useEffect(() => {
    if (data?.clubVitrineSettings) {
      setCustomDomain(data.clubVitrineSettings.customDomain ?? '');
      setVitrinePublished(data.clubVitrineSettings.vitrinePublished);
    }
  }, [data]);

  async function handleSave(): Promise<void> {
    try {
      await save({
        variables: {
          input: {
            customDomain: customDomain.trim() || null,
            vitrinePublished,
          },
        },
      });
      showToast('Paramètres enregistrés.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de sauvegarde',
        'error',
      );
    }
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">
              <Link to="/vitrine">← Site vitrine</Link>
            </p>
            <h1 className="members-loom__title">Paramètres</h1>
          </div>
        </div>
      </header>

      {error ? (
        <p className="form-error">{error.message}</p>
      ) : loading && !data ? (
        <p className="muted">Chargement…</p>
      ) : (
        <section
          style={{
            maxWidth: 680,
            border: '1px solid var(--border, #ddd)',
            borderRadius: 8,
            padding: 24,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Publication</h2>
          <label className="field">
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                checked={vitrinePublished}
                onChange={(e) => setVitrinePublished(e.target.checked)}
              />
              Site vitrine publié (visible publiquement)
            </span>
          </label>

          <h2 style={{ marginTop: 32 }}>Domaine personnalisé</h2>
          <p className="muted">
            Pointez votre domaine (CNAME) vers ClubFlow puis saisissez-le ici.
            Laisser vide pour utiliser le sous-domaine{' '}
            <code>&lt;slug&gt;.clubflow.fr</code> par défaut.
          </p>
          <label className="field">
            <span>Domaine</span>
            <input
              type="text"
              placeholder="www.mondojo.fr"
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
            />
          </label>

          <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
            <button
              type="button"
              className="btn btn-tight"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
