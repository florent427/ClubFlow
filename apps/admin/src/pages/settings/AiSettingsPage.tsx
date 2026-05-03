import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CLUB_AI_SETTINGS,
  CLUB_AI_USAGE_LOGS,
  UPDATE_CLUB_AI_SETTINGS,
  type AiSettings,
  type AiUsageLog,
} from '../../lib/ai-documents';
import { useToast } from '../../components/ToastProvider';

/**
 * Paramètres IA par club :
 *  - Clé API OpenRouter (chiffrée côté serveur)
 *  - Modèle texte (chat completions)
 *  - Modèle image (génération d'images)
 *  - Compteurs de tokens cumulés + historique
 */
export function AiSettingsPage() {
  const { showToast } = useToast();
  const { data, loading, error } = useQuery<{ clubAiSettings: AiSettings }>(
    CLUB_AI_SETTINGS,
    { fetchPolicy: 'cache-and-network' },
  );
  const { data: logsData } = useQuery<{ clubAiUsageLogs: AiUsageLog[] }>(
    CLUB_AI_USAGE_LOGS,
    { variables: { limit: 50 }, fetchPolicy: 'cache-and-network' },
  );
  const [save, { loading: saving }] = useMutation(UPDATE_CLUB_AI_SETTINGS, {
    refetchQueries: [{ query: CLUB_AI_SETTINGS }],
  });

  const s = data?.clubAiSettings;
  const [apiKey, setApiKey] = useState('');
  const [textModel, setTextModel] = useState('');
  const [textFallbackModel, setTextFallbackModel] = useState('');
  const [imageModel, setImageModel] = useState('');
  const [showCustomText, setShowCustomText] = useState(false);
  const [showCustomFallback, setShowCustomFallback] = useState(false);
  const [showCustomImage, setShowCustomImage] = useState(false);

  useEffect(() => {
    if (!s) return;
    setTextModel(s.textModel);
    setTextFallbackModel(s.textFallbackModel ?? '');
    setImageModel(s.imageModel);
    setShowCustomText(!s.curatedTextModels.includes(s.textModel));
    // Fallback : vide = pas activé, sinon custom si hors curated
    setShowCustomFallback(
      !!s.textFallbackModel &&
        !s.curatedTextModels.includes(s.textFallbackModel),
    );
    setShowCustomImage(!s.curatedImageModels.includes(s.imageModel));
  }, [s]);

  async function handleSave(): Promise<void> {
    try {
      await save({
        variables: {
          input: {
            apiKey: apiKey.trim() || undefined,
            textModel: textModel.trim() || null,
            textFallbackModel: textFallbackModel.trim() || null,
            imageModel: imageModel.trim() || null,
          },
        },
      });
      setApiKey('');
      showToast('Paramètres IA enregistrés.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  async function handleClearKey(): Promise<void> {
    if (!confirm('Supprimer la clé API OpenRouter ?')) return;
    try {
      await save({ variables: { input: { clearApiKey: true } } });
      showToast('Clé API supprimée.', 'success');
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
              <Link to="/settings">← Paramètres</Link>
            </p>
            <h1 className="members-loom__title">Intégration IA</h1>
            <p className="muted">
              Branche un compte{' '}
              <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
                OpenRouter
              </a>{' '}
              pour activer la génération d'articles SEO et d'images par IA.
            </p>
          </div>
        </div>
      </header>

      {error ? (
        <p className="form-error">{error.message}</p>
      ) : loading && !s ? (
        <p className="muted">Chargement…</p>
      ) : s ? (
        <section style={{ maxWidth: 880, display: 'grid', gap: 24 }}>
          {/* Clé API */}
          <div style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Clé API OpenRouter</h2>
            <p className="muted">
              La clé est chiffrée (AES-256-GCM) côté serveur — seule la version
              masquée est renvoyée à l'UI.
            </p>
            {s.hasApiKey ? (
              <p style={{ marginBottom: 12 }}>
                <strong>Configurée :</strong> <code>{s.apiKeyMasked}</code>{' '}
                <button
                  type="button"
                  className="btn btn-tight btn-ghost"
                  style={{ marginLeft: 8 }}
                  onClick={() => void handleClearKey()}
                >
                  Supprimer
                </button>
              </p>
            ) : (
              <p className="form-error" style={{ marginBottom: 12 }}>
                Aucune clé configurée — la génération IA est désactivée.
              </p>
            )}
            <label className="field">
              <span>
                {s.hasApiKey ? 'Remplacer la clé' : 'Renseigner une clé'}
              </span>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-v1-…"
                autoComplete="new-password"
              />
            </label>
          </div>

          {/* Modèles */}
          <div style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Modèles</h2>
            <p className="muted">
              Le modèle texte rédige l'article + métadonnées SEO. Le modèle image
              génère l'image mise en avant et les images inline.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 20,
              }}
            >
              <div>
                <label className="field">
                  <span>Modèle texte</span>
                  {!showCustomText ? (
                    <select
                      value={textModel}
                      onChange={(e) => {
                        if (e.target.value === '__custom') {
                          setShowCustomText(true);
                          setTextModel('');
                        } else {
                          setTextModel(e.target.value);
                        }
                      }}
                    >
                      {s.curatedTextModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      <option value="__custom">— Autre (saisie libre) —</option>
                    </select>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={textModel}
                        placeholder="ex. anthropic/claude-3.5-sonnet"
                        onChange={(e) => setTextModel(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-tight btn-ghost"
                        style={{ marginTop: 4, fontSize: 12 }}
                        onClick={() => {
                          setShowCustomText(false);
                          setTextModel(s.curatedTextModels[0] ?? '');
                        }}
                      >
                        ← Liste prédéfinie
                      </button>
                    </>
                  )}
                </label>
              </div>
              <div>
                <label className="field">
                  <span>
                    Modèle texte de fallback{' '}
                    <span
                      style={{
                        fontSize: 11,
                        color: '#1e40af',
                        background: '#dbeafe',
                        padding: '1px 6px',
                        borderRadius: 8,
                        fontWeight: 500,
                        marginLeft: 4,
                      }}
                    >
                      optionnel
                    </span>
                  </span>
                  {!showCustomFallback ? (
                    <select
                      value={textFallbackModel}
                      onChange={(e) => {
                        if (e.target.value === '__custom') {
                          setShowCustomFallback(true);
                          setTextFallbackModel('');
                        } else {
                          setTextFallbackModel(e.target.value);
                        }
                      }}
                    >
                      <option value="">— Aucun (pas de fallback) —</option>
                      {s.curatedTextModels
                        .filter((m) => m !== textModel)
                        .map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      <option value="__custom">
                        — Autre (saisie libre) —
                      </option>
                    </select>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={textFallbackModel}
                        placeholder="ex. anthropic/claude-sonnet-4-5"
                        onChange={(e) => setTextFallbackModel(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-tight btn-ghost"
                        style={{ marginTop: 4, fontSize: 12 }}
                        onClick={() => {
                          setShowCustomFallback(false);
                          setTextFallbackModel('');
                        }}
                      >
                        ← Liste prédéfinie
                      </button>
                    </>
                  )}
                  <small
                    className="muted"
                    style={{ fontSize: 11.5, marginTop: 4, display: 'block' }}
                  >
                    Déclenché automatiquement si le modèle principal échoue
                    3× sur un tool call (ex. renvoie des arguments vides).
                    Recommandé : <code>anthropic/claude-sonnet-4-5</code> ou{' '}
                    <code>openai/gpt-4o</code>.
                  </small>
                </label>
              </div>
              <div>
                <label className="field">
                  <span>Modèle image</span>
                  {!showCustomImage ? (
                    <select
                      value={imageModel}
                      onChange={(e) => {
                        if (e.target.value === '__custom') {
                          setShowCustomImage(true);
                          setImageModel('');
                        } else {
                          setImageModel(e.target.value);
                        }
                      }}
                    >
                      {s.curatedImageModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      <option value="__custom">— Autre (saisie libre) —</option>
                    </select>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={imageModel}
                        placeholder="ex. openai/dall-e-3"
                        onChange={(e) => setImageModel(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-tight btn-ghost"
                        style={{ marginTop: 4, fontSize: 12 }}
                        onClick={() => {
                          setShowCustomImage(false);
                          setImageModel(s.curatedImageModels[0] ?? '');
                        }}
                      >
                        ← Liste prédéfinie
                      </button>
                    </>
                  )}
                </label>
              </div>
            </div>
          </div>

          {/* Compteurs */}
          <div style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Consommation cumulée</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 16,
              }}
            >
              <Metric label="Tokens entrée" value={s.tokensInputUsed} />
              <Metric label="Tokens sortie" value={s.tokensOutputUsed} />
              <Metric label="Images générées" value={s.imagesGenerated} />
            </div>
            {logsData?.clubAiUsageLogs && logsData.clubAiUsageLogs.length > 0 ? (
              <details style={{ marginTop: 20 }}>
                <summary>
                  Historique des {logsData.clubAiUsageLogs.length} derniers
                  appels
                </summary>
                <table
                  style={{
                    width: '100%',
                    marginTop: 12,
                    fontSize: 12,
                    borderCollapse: 'collapse',
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        textAlign: 'left',
                        borderBottom: '1px solid #ccc',
                      }}
                    >
                      <th style={{ padding: '6px 4px' }}>Date</th>
                      <th style={{ padding: '6px 4px' }}>Feature</th>
                      <th style={{ padding: '6px 4px' }}>Modèle</th>
                      <th
                        style={{ padding: '6px 4px', textAlign: 'right' }}
                      >
                        Tokens in
                      </th>
                      <th
                        style={{ padding: '6px 4px', textAlign: 'right' }}
                      >
                        Tokens out
                      </th>
                      <th
                        style={{ padding: '6px 4px', textAlign: 'right' }}
                      >
                        Images
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {logsData.clubAiUsageLogs.map((log) => (
                      <tr
                        key={log.id}
                        style={{ borderBottom: '1px solid #eee' }}
                      >
                        <td style={{ padding: '4px' }}>
                          {new Date(log.createdAt).toLocaleString('fr-FR')}
                        </td>
                        <td style={{ padding: '4px' }}>{log.feature}</td>
                        <td style={{ padding: '4px', fontFamily: 'monospace' }}>
                          {log.model}
                        </td>
                        <td style={{ padding: '4px', textAlign: 'right' }}>
                          {log.inputTokens.toLocaleString('fr-FR')}
                        </td>
                        <td style={{ padding: '4px', textAlign: 'right' }}>
                          {log.outputTokens.toLocaleString('fr-FR')}
                        </td>
                        <td style={{ padding: '4px', textAlign: 'right' }}>
                          {log.imagesGenerated}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ) : null}
          </div>

          <button
            type="button"
            className="btn btn-tight"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </section>
      ) : null}
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        padding: 16,
        border: '1px solid var(--border, #eee)',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--muted, #888)',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 300, marginTop: 6 }}>
        {value.toLocaleString('fr-FR')}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border, #ddd)',
  borderRadius: 8,
  padding: 20,
};
