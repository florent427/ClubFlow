import { useMutation } from '@apollo/client/react';
import { useRef, useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import { getClubId, getToken } from '../../lib/storage';

function apiBase(): string {
  return (
    (import.meta.env as Record<string, string | undefined>)
      .VITE_GRAPHQL_HTTP?.replace(/\/graphql.*$/, '') ?? 'http://localhost:3000'
  );
}

export interface DocumentRowLike {
  id: string;
  mediaAssetId: string;
  kind: string;
  fileName: string;
  publicUrl: string;
  mimeType: string;
}

interface Props<KindEnum extends string> {
  /** Documents déjà attachés. */
  documents: DocumentRowLike[];
  /** Variantes d'enum kind supportées par l'entité (grant/sponsor). */
  kindOptions: Array<{ value: KindEnum; label: string }>;
  /** Valeur par défaut sélectionnée. */
  defaultKind: KindEnum;
  /** Mutation GraphQL pour attacher un document (accepte variables). */
  attachMutation: ReturnType<typeof useMutation>[0];
  /** Mutation GraphQL pour détacher un document (accepte variables). */
  detachMutation: ReturnType<typeof useMutation>[0];
  /** Variables attach (ex: { grantId, mediaAssetId, kind } ou { dealId, ... }). */
  attachVariablesFor: (
    mediaAssetId: string,
    kind: KindEnum,
  ) => Record<string, unknown>;
  /** Callback après succès (pour refetch). */
  onChanged: () => void;
  /** Label MIME de download libre. */
  accept?: string;
}

/**
 * Composant réutilisable pour l'upload + liste des documents attachés à
 * une subvention ou un sponsoring. Gère le file picker, l'upload vers
 * /media/upload, puis l'appel à la mutation attach.
 */
export function DocumentUploadSection<KindEnum extends string>({
  documents,
  kindOptions,
  defaultKind,
  attachMutation,
  detachMutation,
  attachVariablesFor,
  onChanged,
  accept = 'image/png,image/jpeg,image/webp,application/pdf',
}: Props<KindEnum>) {
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [kind, setKind] = useState<KindEnum>(defaultKind);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function onUpload(file: File) {
    const token = getToken();
    const clubId = getClubId();
    if (!token || !clubId) {
      showToast('Session invalide', 'error');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const isImage = file.type.startsWith('image/');
      form.append('kind', isImage ? 'IMAGE' : 'DOCUMENT');
      const res = await fetch(`${apiBase()}/media/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Club-Id': clubId,
        },
        body: form,
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Upload échoué (${res.status}) : ${txt.slice(0, 200)}`);
      }
      const asset = (await res.json()) as { id: string };
      await attachMutation({
        variables: attachVariablesFor(asset.id, kind),
      });
      showToast('Document ajouté', 'success');
      onChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onDetach(documentId: string) {
    try {
      await detachMutation({ variables: { documentId } });
      showToast('Document retiré', 'success');
      onChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  return (
    <div className="cf-docs-section">
      <div className="cf-docs-section__head">
        <h4>Documents ({documents.length})</h4>
        <div className="cf-docs-section__upload">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as KindEnum)}
            disabled={uploading}
          >
            {kindOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
            }}
          />
          <button
            type="button"
            className="cf-btn cf-btn--sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            <span className="material-symbols-outlined" aria-hidden>
              upload
            </span>
            {uploading ? 'Upload…' : 'Ajouter'}
          </button>
        </div>
      </div>
      {documents.length === 0 ? (
        <p className="cf-muted">Aucun document attaché.</p>
      ) : (
        <ul className="cf-docs-list">
          {documents.map((d) => (
            <li key={d.id} className="cf-docs-list__item">
              <a href={d.publicUrl} target="_blank" rel="noopener noreferrer">
                <span className="material-symbols-outlined" aria-hidden>
                  {d.mimeType.startsWith('image/') ? 'image' : 'description'}
                </span>
                {d.fileName}
                <small className="cf-muted">
                  {kindOptions.find((o) => o.value === d.kind)?.label ?? d.kind}
                </small>
              </a>
              <button
                type="button"
                className="btn-ghost btn-ghost--danger btn-ghost--sm"
                onClick={() => void onDetach(d.id)}
                aria-label="Retirer"
              >
                <span className="material-symbols-outlined" aria-hidden>
                  close
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
