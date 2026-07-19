import { useRef, useState } from 'react';
import { useToast } from './ToastProvider';
import { getClubId, getToken } from '../lib/storage';

function apiBase(): string {
  return (
    (import.meta.env as Record<string, string | undefined>)
      .VITE_GRAPHQL_HTTP?.replace(/\/graphql.*$/, '') ?? 'http://localhost:3000'
  );
}

/**
 * Types acceptés côté serveur pour `kind=image`
 * (`MediaAssetsService.ALLOWED_IMAGE_MIME`). On les répète ici pour que le
 * navigateur filtre déjà dans la boîte de dialogue : un fichier refusé au
 * moment du clic vaut mieux qu'un refus après l'upload.
 *
 * SVG volontairement absent : c'est un format légitime côté serveur (logos),
 * mais pour une photo de catalogue produit ça ne veut rien dire, et un SVG
 * est un document actif — inutile d'ouvrir cette porte ici.
 */
const TYPES_ACCEPTES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/**
 * Plafond volontairement plus bas que les 10 Mo autorisés par l'API pour une
 * image : une photo de catalogue n'en a pas besoin, et le club qui téléverse
 * un RAW de 40 Mo doit l'apprendre AVANT d'attendre la fin d'un upload.
 */
const TAILLE_MAX_OCTETS = 2 * 1024 * 1024;

interface Props {
  /** URL de la photo actuelle. Chaîne vide = pas de photo. */
  value: string;
  /** Appelé avec la nouvelle URL, ou '' quand la photo est retirée. */
  onChange: (url: string) => void;
  /** Désactive le champ (formulaire en cours d'enregistrement). */
  disabled?: boolean;
}

/**
 * Sélecteur de photo produit : choix du fichier, aperçu, retrait.
 *
 * Calqué sur `pages/accounting/DocumentUploadSection.tsx` — même POST vers
 * `/media/upload`, mêmes en-têtes, même gestion d'erreur. La seule
 * différence est le retour : ici on remonte `publicUrl` au formulaire, qui
 * l'enregistre dans `ShopProduct.imageUrl`.
 *
 * Le champ ne pose PAS de `<input type="url">` en repli : l'admin qui colle
 * une URL externe crée un lien qui casse le jour où le fournisseur range son
 * catalogue. La photo vit dans le stockage du club.
 */
export function ProductImageField({ value, onChange, disabled }: Props) {
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function onUpload(file: File) {
    // ── Garde-fous locaux, avant tout octet envoyé ──────────────────
    if (!TYPES_ACCEPTES.includes(file.type)) {
      showToast(
        'Format non accepté. Utilisez une image JPEG, PNG, WebP ou GIF.',
        'error',
      );
      return;
    }
    if (file.size > TAILLE_MAX_OCTETS) {
      const mo = (file.size / (1024 * 1024)).toFixed(1).replace('.', ',');
      showToast(
        `Photo trop lourde (${mo} Mo). Maximum 2 Mo — réduisez-la avant de réessayer.`,
        'error',
      );
      return;
    }

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
      // `kind` se lit en query string côté contrôleur (`@Query('kind')`),
      // pas dans le body multipart.
      const res = await fetch(`${apiBase()}/media/upload?kind=image&visibility=public`, {
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
      const asset = (await res.json()) as { publicUrl?: string };
      if (!asset.publicUrl) {
        throw new Error("L'API n'a pas retourné d'URL pour la photo.");
      }
      onChange(asset.publicUrl);
      showToast('Photo ajoutée', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      setUploading(false);
      // Remise à zéro : sans ça, re-choisir le MÊME fichier après une erreur
      // ne déclenche pas de `change` et le bouton paraît mort.
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="cf-field">
      <span className="cf-field__label">Photo du produit</span>

      {value ? (
        <div className="cf-product-photo">
          <img
            src={value}
            alt="Aperçu de la photo du produit"
            className="cf-product-photo__preview"
            style={{
              maxWidth: 160,
              maxHeight: 160,
              objectFit: 'contain',
              display: 'block',
              borderRadius: 8,
            }}
          />
          <div className="cf-product-photo__actions">
            <button
              type="button"
              className="cf-btn cf-btn--sm"
              onClick={() => fileRef.current?.click()}
              disabled={disabled || uploading}
            >
              {uploading ? 'Envoi…' : 'Remplacer'}
            </button>
            <button
              type="button"
              className="btn-ghost btn-ghost--danger btn-ghost--sm"
              onClick={() => onChange('')}
              disabled={disabled || uploading}
            >
              Retirer
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="cf-btn cf-btn--sm"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading}
        >
          <span className="material-symbols-outlined" aria-hidden>
            add_photo_alternate
          </span>
          {uploading ? 'Envoi…' : 'Choisir une photo'}
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={TYPES_ACCEPTES.join(',')}
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onUpload(f);
        }}
      />
      <span className="cf-field__hint">
        JPEG, PNG, WebP ou GIF — 2 Mo maximum.
      </span>
    </div>
  );
}
