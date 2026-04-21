import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ADD_VITRINE_GALLERY_PHOTO,
  CLUB_VITRINE_GALLERY,
  DELETE_VITRINE_GALLERY_PHOTO,
  UPDATE_VITRINE_GALLERY_PHOTO,
  type ClubGalleryPhoto,
  type ClubVitrineGalleryData,
} from '../../lib/vitrine-documents';
import { getClubId, getToken } from '../../lib/storage';
import { useToast } from '../../components/ToastProvider';
import { AdminMediaPicker } from './AdminMediaPicker';

function apiBase(): string {
  return (
    (import.meta.env as Record<string, string | undefined>)
      .VITE_GRAPHQL_HTTP?.replace(/\/graphql.*$/, '') ?? 'http://localhost:3000'
  );
}

/**
 * Galerie admin : ajout par upload direct, édition caption/catégorie,
 * réordonnancement par ↑ / ↓, suppression.
 *
 * Le drag-drop complet (HTML5 DnD) est possible mais lourd pour peu de gain
 * par rapport à des boutons clairs — on reste sur ↑ / ↓ qui persistent
 * `sortOrder` immédiatement.
 */
export function VitrineGalleryPage() {
  const { showToast } = useToast();
  const { data, loading, error } = useQuery<ClubVitrineGalleryData>(
    CLUB_VITRINE_GALLERY,
    { fetchPolicy: 'cache-and-network' },
  );
  const refetch = [{ query: CLUB_VITRINE_GALLERY }];
  const [addPhoto, { loading: adding }] = useMutation(
    ADD_VITRINE_GALLERY_PHOTO,
    { refetchQueries: refetch },
  );
  const [updatePhoto] = useMutation(UPDATE_VITRINE_GALLERY_PHOTO, {
    refetchQueries: refetch,
  });
  const [deletePhoto] = useMutation(DELETE_VITRINE_GALLERY_PHOTO, {
    refetchQueries: refetch,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function pickFromLibrary(asset: {
    id: string;
  }): Promise<void> {
    try {
      await addPhoto({
        variables: {
          input: {
            mediaAssetId: asset.id,
            category: null,
            caption: null,
            sortOrder: Date.now(),
          },
        },
      });
      showToast('Photo ajoutée à la galerie.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  async function handleUpload(
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const token = getToken();
    const clubId = getClubId();
    if (!token || !clubId) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(`${apiBase()}/media/upload?kind=image`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Club-Id': clubId,
          },
          body: form,
        });
        if (!res.ok) {
          showToast(`Upload ${file.name} : HTTP ${res.status}`, 'error');
          continue;
        }
        const asset = (await res.json()) as { id: string };
        await addPhoto({
          variables: {
            input: {
              mediaAssetId: asset.id,
              category: null,
              caption: null,
              sortOrder: Date.now(),
            },
          },
        });
      }
      showToast(`${files.length} photo(s) ajoutée(s).`, 'success');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function move(photo: ClubGalleryPhoto, direction: -1 | 1): Promise<void> {
    const photos = (data?.clubVitrineGalleryPhotos ?? []).slice().sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const idx = photos.findIndex((p) => p.id === photo.id);
    if (idx < 0) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= photos.length) return;
    const neighbour = photos[targetIdx]!;
    // Swap sortOrder
    await updatePhoto({
      variables: {
        input: { id: photo.id, sortOrder: neighbour.sortOrder },
      },
    });
    await updatePhoto({
      variables: {
        input: { id: neighbour.id, sortOrder: photo.sortOrder },
      },
    });
  }

  async function updateCaption(
    photo: ClubGalleryPhoto,
    caption: string,
  ): Promise<void> {
    if (caption === (photo.caption ?? '')) return;
    await updatePhoto({
      variables: {
        input: { id: photo.id, caption },
      },
    });
  }

  async function updateCategory(
    photo: ClubGalleryPhoto,
    category: string,
  ): Promise<void> {
    if (category === (photo.category ?? '')) return;
    await updatePhoto({
      variables: {
        input: { id: photo.id, category },
      },
    });
  }

  async function remove(photo: ClubGalleryPhoto): Promise<void> {
    if (!window.confirm('Supprimer cette photo ?')) return;
    try {
      await deletePhoto({ variables: { id: photo.id } });
      showToast('Photo supprimée.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  const photos = (data?.clubVitrineGalleryPhotos ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">
              <Link to="/vitrine">← Site vitrine</Link>
            </p>
            <h1 className="members-loom__title">Galerie ({photos.length})</h1>
          </div>
        </div>
      </header>

      <section
        style={{
          border: '1px solid var(--border, #ddd)',
          borderRadius: 8,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Ajouter des photos</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            disabled={uploading || adding}
            onChange={(e) => void handleUpload(e)}
          />
          <span className="muted" style={{ fontSize: 11 }}>
            ou
          </span>
          <button
            type="button"
            className="btn btn-tight btn-ghost"
            onClick={() => setPickerOpen(true)}
          >
            Choisir depuis la bibliothèque média
          </button>
        </div>
        {uploading || adding ? (
          <p className="muted">Envoi en cours…</p>
        ) : (
          <p className="muted" style={{ fontSize: 12 }}>
            PNG, JPEG, WebP, GIF, SVG. Max 10 Mo par fichier. Plusieurs
            fichiers à la fois possible.
          </p>
        )}
      </section>

      <AdminMediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(asset) => void pickFromLibrary(asset)}
        kind="IMAGE"
      />

      {error ? (
        <p className="form-error">{error.message}</p>
      ) : loading && photos.length === 0 ? (
        <p className="muted">Chargement…</p>
      ) : photos.length === 0 ? (
        <p className="muted">Aucune photo pour le moment.</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          {photos.map((p, i) => (
            <article
              key={p.id}
              style={{
                border: '1px solid var(--border, #ddd)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <img
                src={p.imageUrl}
                alt={p.caption ?? ''}
                style={{
                  width: '100%',
                  aspectRatio: '4/3',
                  objectFit: 'cover',
                }}
                loading="lazy"
              />
              <div style={{ padding: 12, display: 'grid', gap: 8 }}>
                <label className="field" style={{ marginBottom: 0 }}>
                  <span style={{ fontSize: 10 }}>Légende</span>
                  <input
                    type="text"
                    defaultValue={p.caption ?? ''}
                    onBlur={(e) =>
                      void updateCaption(p, e.currentTarget.value)
                    }
                  />
                </label>
                <label className="field" style={{ marginBottom: 0 }}>
                  <span style={{ fontSize: 10 }}>Catégorie</span>
                  <input
                    type="text"
                    defaultValue={p.category ?? ''}
                    placeholder="ex. cours, compétitions…"
                    onBlur={(e) =>
                      void updateCategory(p, e.currentTarget.value)
                    }
                  />
                </label>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button
                    type="button"
                    className="btn btn-tight btn-ghost"
                    disabled={i === 0}
                    onClick={() => void move(p, -1)}
                    title="Monter"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-tight btn-ghost"
                    disabled={i === photos.length - 1}
                    onClick={() => void move(p, 1)}
                    title="Descendre"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn-tight btn-ghost"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => void remove(p)}
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
