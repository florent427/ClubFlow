import * as storage from './storage';

/**
 * Récupère la base API en réutilisant `EXPO_PUBLIC_GRAPHQL_HTTP`
 * (en retirant `/graphql`). Identique au pattern utilisé dans
 * `SettingsScreen.uploadPhoto`.
 */
function getApiBase(): string {
  const raw = process.env.EXPO_PUBLIC_GRAPHQL_HTTP ?? '';
  return raw.replace(/\/graphql.*$/, '') || 'http://localhost:3000';
}

export type MediaUploadKind = 'image' | 'document' | 'video' | 'audio';

export type UploadedMediaAsset = {
  id: string;
  publicUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type LocalFileAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
};

/**
 * Upload un fichier local (URI Expo) vers `POST /media/upload?kind=...`.
 * Retourne les métadonnées du `MediaAsset` créé. À utiliser pour les
 * pièces jointes du chat (images, vidéos, vocaux, documents).
 *
 * Le serveur applique :
 *  - whitelist MIME (cf. `MediaAssetsService.ALLOWED_*_MIME`)
 *  - vérification magic-byte (anti-spoofing)
 *  - limites de taille par kind (image 5MB, doc 10MB, video 50MB,
 *    audio 10MB)
 *
 * Throw si l'upload échoue (réseau, taille, MIME refusé…).
 */
export async function uploadMediaAsset(
  asset: LocalFileAsset,
  kind: MediaUploadKind,
): Promise<UploadedMediaAsset> {
  const token = await storage.getToken();
  const clubId = await storage.getClubId();
  if (!token || !clubId) {
    throw new Error('Session expirée. Reconnectez-vous.');
  }

  // Devine un nom de fichier propre — Expo retourne parfois juste un
  // UUID sans extension dans `asset.uri`, ce qui peut faire planter
  // certaines validations côté serveur.
  const fileName = asset.fileName ?? guessFileName(asset.uri, kind);
  const mimeType = asset.mimeType ?? guessMimeType(fileName, kind);

  const form = new FormData();
  form.append('file', {
    uri: asset.uri,
    name: fileName,
    type: mimeType,
  } as unknown as Blob);

  const res = await fetch(
    `${getApiBase()}/media/upload?kind=${encodeURIComponent(kind)}`,
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
    const text = await res.text().catch(() => '');
    throw new Error(
      `Upload échoué (HTTP ${res.status}). ${text || 'Vérifie taille / format.'}`,
    );
  }
  const data = (await res.json()) as UploadedMediaAsset;
  if (!data?.id) {
    throw new Error('Réponse upload invalide.');
  }
  return data;
}

function guessFileName(uri: string, kind: MediaUploadKind): string {
  const tail = uri.split('/').pop() ?? `media-${Date.now()}`;
  if (tail.includes('.')) return tail;
  // Pas d'extension → on en ajoute une cohérente avec le kind, sinon
  // le serveur peut refuser (extension whitelist).
  const ext = defaultExtensionForKind(kind);
  return `${tail}.${ext}`;
}

function defaultExtensionForKind(kind: MediaUploadKind): string {
  switch (kind) {
    case 'image':
      return 'jpg';
    case 'document':
      return 'pdf';
    case 'video':
      return 'mp4';
    case 'audio':
      return 'm4a';
  }
}

function guessMimeType(fileName: string, kind: MediaUploadKind): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    pdf: 'application/pdf',
    mp4: kind === 'audio' ? 'audio/mp4' : 'video/mp4',
    mov: 'video/quicktime',
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    webm: kind === 'audio' ? 'audio/webm' : 'video/webm',
    aac: 'audio/aac',
  };
  return map[ext] ?? 'application/octet-stream';
}
