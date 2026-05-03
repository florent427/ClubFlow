import { useCallback, useEffect, useState } from 'react';
import { getClubId, getToken } from '../../lib/storage';
import { useToast } from '../../components/ToastProvider';

export interface AdminMediaAsset {
  id: string;
  publicUrl: string;
  fileName: string;
  kind: 'IMAGE' | 'DOCUMENT' | 'OTHER';
  mimeType: string;
  sizeBytes: number;
}

function apiBase(): string {
  return (
    (import.meta.env as Record<string, string | undefined>)
      .VITE_GRAPHQL_HTTP?.replace(/\/graphql.*$/, '') ?? 'http://localhost:3000'
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (asset: AdminMediaAsset) => void;
  kind?: 'IMAGE' | 'DOCUMENT';
}

/**
 * Modale admin pour piocher un média déjà uploadé. Liste la bibliothèque
 * via `GET /media` avec JWT + X-Club-Id. Bouton « + upload » pour ajouter
 * à la volée (REST multipart).
 */
export function AdminMediaPicker({ open, onClose, onPick, kind = 'IMAGE' }: Props) {
  const { showToast } = useToast();
  const [assets, setAssets] = useState<AdminMediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    const clubId = getClubId();
    if (!token || !clubId) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase()}/media?kind=${kind}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Club-Id': clubId,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AdminMediaAsset[];
      setAssets(data);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de chargement',
        'error',
      );
    } finally {
      setLoading(false);
    }
  }, [kind, showToast]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function handleUpload(
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    const token = getToken();
    const clubId = getClubId();
    if (!token || !clubId) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(
        `${apiBase()}/media/upload?kind=${kind === 'IMAGE' ? 'image' : 'document'}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Club-Id': clubId,
          },
          body: form,
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const asset = (await res.json()) as AdminMediaAsset;
      showToast('Fichier uploadé.', 'success');
      onPick(asset);
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    } finally {
      setUploading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 8,
          maxWidth: 960,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 24,
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0 }}>Choisir un média</h2>
          <button
            type="button"
            className="btn btn-tight btn-ghost"
            onClick={onClose}
          >
            Fermer
          </button>
        </header>

        <label
          style={{
            display: 'inline-block',
            padding: '10px 18px',
            border: '1px dashed #888',
            cursor: uploading ? 'wait' : 'pointer',
            marginBottom: 16,
          }}
        >
          {uploading ? 'Envoi…' : '+ Uploader un fichier'}
          <input
            type="file"
            accept={kind === 'IMAGE' ? 'image/*' : 'application/pdf'}
            disabled={uploading}
            onChange={(e) => void handleUpload(e)}
            style={{ display: 'none' }}
          />
        </label>

        {loading && assets.length === 0 ? (
          <p className="muted">Chargement…</p>
        ) : assets.length === 0 ? (
          <p className="muted">Aucun média uploadé.</p>
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
                onClick={() => {
                  onPick(a);
                  onClose();
                }}
                title={a.fileName}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border, #ddd)',
                  padding: 0,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  borderRadius: 6,
                }}
              >
                {a.kind === 'IMAGE' ? (
                  <img
                    src={a.publicUrl}
                    alt=""
                    loading="lazy"
                    style={{
                      width: '100%',
                      aspectRatio: '4/3',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      aspectRatio: '4/3',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#f0f0f0',
                      fontSize: 11,
                      fontFamily: 'monospace',
                    }}
                  >
                    {a.mimeType}
                  </div>
                )}
                <div
                  style={{
                    fontSize: 11,
                    padding: '6px 8px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {a.fileName}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
