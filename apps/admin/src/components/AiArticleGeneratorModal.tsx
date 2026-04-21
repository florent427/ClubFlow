import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import {
  CLUB_AI_SETTINGS,
  GENERATE_VITRINE_ARTICLE_DRAFT,
  type AiArticleDraft,
  type AiSettings,
} from '../lib/ai-documents';
import { useToast } from './ToastProvider';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Callback quand un draft est généré avec succès. */
  onDraftReady: (draft: AiArticleDraft) => void;
}

/**
 * Modal "Générer un article avec IA" — pilote la mutation
 * `generateVitrineArticleDraft`. Garde la clé API hors de l'UI (traitée
 * côté serveur).
 */
export function AiArticleGeneratorModal({ open, onClose, onDraftReady }: Props) {
  const { showToast } = useToast();
  const { data } = useQuery<{ clubAiSettings: AiSettings }>(CLUB_AI_SETTINGS, {
    skip: !open,
  });
  const [generate, { loading }] = useMutation<{
    generateVitrineArticleDraft: AiArticleDraft;
  }>(GENERATE_VITRINE_ARTICLE_DRAFT);

  const [sourceText, setSourceText] = useState('');
  const [tone, setTone] = useState('informatif, clair, expert');
  const [generateFeatured, setGenerateFeatured] = useState(true);
  const [inlineCount, setInlineCount] = useState(3);

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
          },
        },
      });
      const draft = res.data?.generateVitrineArticleDraft;
      if (!draft) throw new Error('Réponse vide');
      showToast(
        `Article généré (${draft.totalInputTokens + draft.totalOutputTokens} tokens, ${draft.totalImagesGenerated} images).`,
        'success',
      );
      onDraftReady(draft);
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
                <span>Générer l'image mise en avant</span>
              </label>
              <label className="field">
                <span>Images inline (0-6)</span>
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
                Le modèle texte rédige l'article puis{' '}
                {generateFeatured || inlineCount > 0
                  ? `${(generateFeatured ? 1 : 0) + inlineCount} image(s) sont générée(s) en parallèle`
                  : "aucune image n'est générée"}
                . Patience…
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
