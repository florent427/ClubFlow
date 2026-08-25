'use client';

import { useCallback, useEffect, useState } from 'react';
import { extractClubIdFromJwt } from './edit-api';
import type { EditContext } from '@/lib/edit-context';

interface MediaAssetLite {
  id: string;
  publicUrl: string;
  fileName: string;
  kind: 'IMAGE' | 'DOCUMENT' | 'OTHER';
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (asset: MediaAssetLite) => void;
  edit: Extract<EditContext, { editMode: true }>;
}

/**
 * Modale « Choisir une image » — liste les MediaAsset du club via REST
 * (`GET /media?kind=IMAGE`) et permet d'uploader un nouveau fichier via
 * `POST /media/upload`.
 *
 * Authentifié avec l'edit JWT (même secret que les JWT admin, accepté par
 * la stratégie JWT de l'API).
 *
 * ⚠️ L'image choisie ici finit dans `sectionsJson` **sous forme d'URL en
 * texte** : aucune clé étrangère ne la relie à la page. Le contrôle de
 * lecture des médias ne peut donc pas déduire qu'elle est publique — c'est
 * `visibility` seul qui la couvre, et un média naît PRIVÉ. D'où les deux
 * précautions ci-dessous : upload en `visibility=public`, et `ensurePublic`
 * sur un asset préexistant. Sans elles, l'image s'affiche en mode édition
 * (JWT présent) et sort en 404 chez le visiteur.
 */
export function MediaPickerModal({ open, onClose, onPick, edit }: Props) {
  const [assets, setAssets] = useState<MediaAssetLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restBase = edit.apiUrl.replace(/\/graphql.*$/, '');
  const clubId = extractClubIdFromJwt(edit.editJwt) ?? '';

  /**
   * Rend l'asset public avant de l'insérer dans la page. Idempotent, et
   * sans effet visible s'il l'était déjà.
   */
  const ensurePublic = useCallback(
    async (assetId: string): Promise<void> => {
      const res = await fetch(`${restBase}/media/${assetId}/public`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${edit.editJwt}`,
          'X-Club-Id': clubId,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    [restBase, edit.editJwt, clubId],
  );

  /** Insère l'asset dans la page, après s'être assuré qu'il est public. */
  const pick = useCallback(
    async (asset: MediaAssetLite): Promise<void> => {
      setError(null);
      try {
        await ensurePublic(asset.id);
      } catch (err) {
        setError(
          err instanceof Error
            ? `Image non rendue publique : ${err.message}`
            : 'Image non rendue publique',
        );
        return;
      }
      onPick(asset);
      onClose();
    },
    [ensurePublic, onPick, onClose],
  );

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${restBase}/media?kind=IMAGE`, {
        headers: {
          Authorization: `Bearer ${edit.editJwt}`,
          'X-Club-Id': clubId,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as MediaAssetLite[];
      setAssets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec');
    } finally {
      setLoading(false);
    }
  }, [restBase, edit.editJwt, clubId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(
        `${restBase}/media/upload?kind=image&visibility=public`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${edit.editJwt}`,
            'X-Club-Id': clubId,
          },
          body: form,
        },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const uploaded = (await res.json()) as MediaAssetLite;
      onPick(uploaded);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload échoué');
    } finally {
      setUploading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--ink)',
          color: 'var(--paper)',
          border: '1px solid var(--line-strong)',
          borderRadius: 8,
          maxWidth: 920,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 24,
          fontFamily: 'var(--sans)',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 18,
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--serif)',
              margin: 0,
              color: 'var(--accent)',
            }}
          >
            Choisir une image
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--muted)',
              fontSize: 22,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </header>

        <label
          style={{
            display: 'inline-block',
            padding: '10px 18px',
            border: '1px dashed var(--accent)',
            color: 'var(--accent)',
            cursor: uploading ? 'not-allowed' : 'pointer',
            marginBottom: 16,
          }}
        >
          {uploading ? 'Envoi…' : '+ Uploader une image'}
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => void handleFile(e)}
            style={{ display: 'none' }}
          />
        </label>

        {error ? (
          <p style={{ color: 'var(--vermillion)' }}>{error}</p>
        ) : null}

        {loading && assets.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Chargement…</p>
        ) : assets.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>
            Aucune image uploadée pour ce club.
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 10,
            }}
          >
            {assets.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => void pick(a)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--line)',
                  padding: 0,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  borderRadius: 4,
                }}
                title={a.fileName}
              >
                <img
                  src={a.publicUrl}
                  alt={a.fileName}
                  style={{
                    width: '100%',
                    aspectRatio: '4/3',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
