import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import {
  CLUB_AI_SETTINGS,
  START_VITRINE_ARTICLE_GENERATION,
  type AiSettings,
  type StartVitrineArticleGenerationData,
} from '../lib/ai-documents';
import { CLUB_VITRINE_ARTICLES } from '../lib/vitrine-documents';
import { useToast } from './ToastProvider';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Callback appelé dès que la génération est lancée (background).
   *  Reçoit l'ID de l'article PENDING nouvellement créé. */
  onGenerationStarted: (articleId: string) => void;
}

/**
 * Modal "Générer un article avec IA" — lance la pipeline en arrière-plan
 * (la mutation retourne l'ID immédiatement). L'utilisateur peut fermer la
 * modale et continuer à bosser ; l'article apparaît dans la liste avec un
 * badge "Génération en cours" qui se met à jour via polling.
 */
export function AiArticleGeneratorModal({
  open,
  onClose,
  onGenerationStarted,
}: Props) {
  const { showToast } = useToast();
  const { data } = useQuery<{ clubAiSettings: AiSettings }>(CLUB_AI_SETTINGS, {
    skip: !open,
  });
  const [generate, { loading }] =
    useMutation<StartVitrineArticleGenerationData>(
      START_VITRINE_ARTICLE_GENERATION,
      { refetchQueries: [{ query: CLUB_VITRINE_ARTICLES }] },
    );

  const [sourceText, setSourceText] = useState('');
  const [tone, setTone] = useState('informatif, clair, expert');
  const [generateFeatured, setGenerateFeatured] = useState(true);
  const [inlineCount, setInlineCount] = useState(3);
  /**
   * 'ai' = l'IA génère vraiment les images (featured + inline).
   * 'placeholders' = l'IA suggère les emplacements/prompts mais on insère
   *   des placeholders SVG dans l'article. L'utilisateur les remplace ensuite
   *   par ses propres photos dans l'éditeur (clic sur l'image → ✕ → upload).
   */
  const [imageMode, setImageMode] = useState<'ai' | 'placeholders'>('ai');
  const [useWebSearch, setUseWebSearch] = useState(false);

  if (!open) return null;

  const s = data?.clubAiSettings;
  const canGenerate = !!s?.hasApiKey;

  async function handleGenerate(): Promise<void> {
    if (!sourceText.trim()) {
      showToast('Saisis d\u2019abord un texte source.', 'error');
      return;
    }
    try {
      const res = await generate({
        variables: {
          input: {
            sourceText: sourceText.trim(),
            tone: tone.trim() || undefined,
            generateFeaturedImage: generateFeatured,
            inlineImageCount: inlineCount,
            useAiImages: imageMode === 'ai',
            useWebSearch,
          },
        },
      });
      const articleId = res.data?.startVitrineArticleGeneration.articleId;
      if (!articleId) throw new Error('Réponse vide');
      showToast(
        'Génération lancée en arrière-plan. L\u2019article apparaît dans la liste ; tu peux continuer à bosser.',
        'success',
      );
      onGenerationStarted(articleId);
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: 'var(--bg, #fff)',
          borderRadius: 12,
          padding: 24,
          maxWidth: 720,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0 }}>Générer un article avec IA</h2>
          <button
            type="button"
            className="btn btn-tight btn-ghost"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {!canGenerate ? (
          <p className="form-error">
            Aucune clé API OpenRouter n'est configurée.{' '}
            <a href="/settings/ai">Configurer l'IA</a>
          </p>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Modèle texte : <code>{s?.textModel}</code> · Image :{' '}
              <code>{s?.imageModel}</code>
            </p>
            <label className="field">
              <span>Texte source (ton brief, notes, ou contenu à reformuler)</span>
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                rows={10}
                placeholder="Ex. Le club a organisé un stage d'été de 3 jours avec 25 participants, masterclass de Sensei Kenji Tanaka, kata Bassai-dai en focus…"
                disabled={loading}
              />
              <small className="muted">
                {sourceText.length} caractères (minimum 20)
              </small>
            </label>

            <label className="field">
              <span>Tonalité</span>
              <input
                type="text"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="informatif, inspirationnel, technique, commercial…"
                disabled={loading}
              />
            </label>

            {/* Recherche web (plugin OpenRouter Exa) */}
            <fieldset
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: 12,
                marginBottom: 12,
                background: useWebSearch ? '#eff6ff' : 'transparent',
              }}
            >
              <legend
                style={{ padding: '0 6px', fontSize: 13, fontWeight: 600 }}
              >
                Recherche web
              </legend>
              <label
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={useWebSearch}
                  onChange={(e) => setUseWebSearch(e.target.checked)}
                  disabled={loading}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ fontWeight: 500 }}>
                    Activer l'accès Internet{' '}
                    <span
                      style={{
                        fontSize: 11,
                        color: '#1e40af',
                        background: '#dbeafe',
                        padding: '1px 6px',
                        borderRadius: 8,
                        marginLeft: 4,
                      }}
                    >
                      +~0,02&nbsp;$
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    Le modèle peut faire des recherches web (Exa) pour
                    récupérer des informations récentes : chiffres, actualités,
                    règlements à jour. Recommandé si ton texte source mentionne
                    des éléments datés ou évolutifs. Sinon, le modèle utilise
                    ses connaissances d'entraînement (qui peuvent être
                    périmées).
                  </div>
                </div>
              </label>
            </fieldset>

            {/* Mode images : IA vs Placeholders */}
            <fieldset
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <legend
                style={{ padding: '0 6px', fontSize: 13, fontWeight: 600 }}
              >
                Mode images
              </legend>
              <div style={{ display: 'grid', gap: 8 }}>
                <label
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="imgmode"
                    checked={imageMode === 'ai'}
                    onChange={() => setImageMode('ai')}
                    disabled={loading}
                    style={{ marginTop: 3 }}
                  />
                  <div>
                    <div style={{ fontWeight: 500 }}>
                      Générer les images par IA{' '}
                      <span
                        style={{
                          fontSize: 11,
                          color: '#b45309',
                          background: '#fef3c7',
                          padding: '1px 6px',
                          borderRadius: 8,
                          marginLeft: 4,
                        }}
                      >
                        coût tokens
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Le modèle image (
                      {s?.imageModel ?? '\u2026'}) créé l'image mise en avant
                      et les images inline.
                    </div>
                  </div>
                </label>
                <label
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="imgmode"
                    checked={imageMode === 'placeholders'}
                    onChange={() => setImageMode('placeholders')}
                    disabled={loading}
                    style={{ marginTop: 3 }}
                  />
                  <div>
                    <div style={{ fontWeight: 500 }}>Placeholders (gratuit)</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      L'IA propose des emplacements et un sujet pour chaque
                      image. Des placeholders sont insérés dans l'article ; tu
                      les remplaces par tes propres photos dans l'éditeur.
                    </div>
                  </div>
                </label>
              </div>
            </fieldset>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
              }}
            >
              <label
                className="field"
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <input
                  type="checkbox"
                  checked={generateFeatured}
                  onChange={(e) => setGenerateFeatured(e.target.checked)}
                  disabled={loading}
                />
                <span>
                  {imageMode === 'ai'
                    ? "Générer l'image mise en avant"
                    : "Placeholder pour l'image mise en avant"}
                </span>
              </label>
              <label className="field">
                <span>
                  {imageMode === 'ai'
                    ? 'Images inline (0-6)'
                    : 'Placeholders inline (0-6)'}
                </span>
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={inlineCount}
                  onChange={(e) => setInlineCount(Math.max(0, Math.min(6, Number(e.target.value))))}
                  disabled={loading}
                />
              </label>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 20,
              }}
            >
              <button
                type="button"
                className="btn btn-tight btn-ghost"
                onClick={onClose}
                disabled={loading}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-tight"
                onClick={() => void handleGenerate()}
                disabled={loading || sourceText.trim().length < 20}
              >
                {loading ? 'Génération en cours… (30-60s)' : 'Générer'}
              </button>
            </div>
            {loading ? (
              <p className="muted" style={{ marginTop: 16, fontSize: 13 }}>
                Le modèle texte rédige l'article
                {imageMode === 'ai' && (generateFeatured || inlineCount > 0)
                  ? `, puis ${(generateFeatured ? 1 : 0) + inlineCount} image(s) sont générée(s) en parallèle`
                  : imageMode === 'placeholders' &&
                      (generateFeatured || inlineCount > 0)
                    ? ' (les images seront des placeholders à remplacer)'
                    : " (aucune image)"}
                . Patience…
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
