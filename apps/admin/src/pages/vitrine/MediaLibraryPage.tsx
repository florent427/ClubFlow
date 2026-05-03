import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getToken, getClubId } from '../../lib/storage';
import { useToast } from '../../components/ToastProvider';

interface MediaAsset {
  id: string;
  kind: 'IMAGE' | 'DOCUMENT' | 'OTHER';
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  publicUrl: string;
  ownerKind: string | null;
  ownerId: string | null;
  createdAt: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

function apiBase(): string {
  return (
    (import.meta.env as Record<string, string | undefined>)
      .VITE_GRAPHQL_HTTP?.replace(/\/graphql.*$/, '') ?? 'http://localhost:3000'
  );
}

/**
 * Bibliothèque média admin — upload + liste + ajout à la galerie.
 *
 * Upload via `POST /media/upload` (multipart, JWT + X-Club-Id).
 * Liste via `GET /media`.
 * Ajout à la galerie : mutation GraphQL dédiée (non encore exposée dans l'UI).
 */
export function MediaLibraryPage() {
  const { showToast } = useToast();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const token = getToken();
      const clubId = getClubId();
      if (!token || !clubId) {
        showToast('Session invalide', 'error');
        return;
      }
      const res = await fetch(`${apiBase()}/media`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Club-Id': clubId,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as MediaAsset[];
      setAssets(data);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de chargement',
        'error',
      );
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleFile(
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
      const kind = file.type.startsWith('image/') ? 'image' : 'document';
      const res = await fetch(
        `${apiBase()}/media/upload?kind=${kind}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Club-Id': clubId,
          },
          body: form,
        },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status} ${text}`);
      }
      showToast(`${file.name} uploadé.`, 'success');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string, name: string): Promise<void> {
    if (!window.confirm(`Supprimer "${name}" ?`)) return;
    const token = getToken();
    const clubId = getClubId();
    if (!token || !clubId) return;
    try {
      const res = await fetch(`${apiBase()}/media/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Club-Id': clubId,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAssets((prev) => prev.filter((a) => a.id !== id));
      showToast('Supprimé.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  async function copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      showToast('URL copiée.', 'success');
    } catch {
      showToast('Impossible de copier', 'error');
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
            <h1 className="members-loom__title">
              Bibliothèque média ({assets.length})
            </h1>
            <p className="muted">
              Uploadez images et documents. Les fichiers sont servis en public
              via <code>/media/:id</code>.
            </p>
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
        <h2 style={{ marginTop: 0 }}>Uploader</h2>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          disabled={uploading}
          onChange={(e) => void handleFile(e)}
        />
        {uploading ? <p className="muted">Envoi en cours…</p> : null}
        <p className="muted" style={{ fontSize: 12 }}>
          Formats : PNG, JPEG, WebP, GIF, SVG, PDF. Taille max : 10 Mo.
        </p>
      </section>

      {loading && assets.length === 0 ? (
        <p className="muted">Chargement…</p>
      ) : assets.length === 0 ? (
        <p className="muted">Aucun média pour le moment.</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
          {assets.map((a) => (
            <article
              key={a.id}
              style={{
                border: '1px solid var(--border, #ddd)',
                borderRadius: 8,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {a.kind === 'IMAGE' ? (
                <img
                  src={a.publicUrl}
                  alt={a.fileName}
                  style={{
                    width: '100%',
                    aspectRatio: '4/3',
                    objectFit: 'cover',
                    background: '#f0f0f0',
                  }}
                  loading="lazy"
                />
              ) : (
                <div
                  style={{
                    aspectRatio: '4/3',
                    background: '#f0f0f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'monospace',
                    color: 'var(--text-soft, #888)',
                  }}
                >
                  {a.mimeType}
                </div>
              )}
              <div style={{ padding: 10, fontSize: 12 }}>
                <div
                  style={{
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={a.fileName}
                >
                  {a.fileName}
                </div>
                <div className="muted">{formatBytes(a.sizeBytes)}</div>
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    marginTop: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-tight btn-ghost"
                    onClick={() => void copyToClipboard(a.publicUrl)}
                  >
                    Copier URL
                  </button>
                  <button
                    type="button"
                    className="btn btn-tight btn-ghost"
                    onClick={() => void handleDelete(a.id, a.fileName)}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
