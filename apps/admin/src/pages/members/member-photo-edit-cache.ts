/** Empreinte courte (compat anciennes entrées). */
export function photoValueFingerprint(val: string): string {
  if (!val) return '';
  const tail = val.length > 64 ? val.slice(-64) : val;
  return `${val.length}|${val.slice(0, 48)}|${tail}`;
}

/** Hachage du texte complet : robuste si l’empreinte courte ne suffit pas. */
export function photoValueHash(val: string): string {
  if (!val) return '';
  let h = 5381;
  for (let i = 0; i < val.length; i++) {
    h = (Math.imul(h, 33) + val.charCodeAt(i)) | 0;
  }
  return `${val.length}:${h >>> 0}`;
}

export type MemberPhotoEditCacheEntry = {
  basis: string;
  zoom: number;
  pan: { x: number; y: number };
  valueFp: string;
  /** Optionnel pour entrées anciennes ; préférer pour la relecture. */
  valueHash?: string;
};

const memory = new Map<string, MemberPhotoEditCacheEntry>();
const SS_KEY = (id: string) => `cf:mpEdit:v3:${id}`;

export function cacheEntryMatchesValue(
  entry: MemberPhotoEditCacheEntry,
  val: string,
): boolean {
  if (!val) {
    return false;
  }
  if (entry.valueFp === photoValueFingerprint(val)) {
    return true;
  }
  if (entry.valueHash && entry.valueHash === photoValueHash(val)) {
    return true;
  }
  return false;
}

export function setMemberPhotoEditCache(
  memberId: string,
  entry: MemberPhotoEditCacheEntry,
) {
  memory.set(memberId, entry);
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SS_KEY(memberId), JSON.stringify(entry));
    }
  } catch {
    /* quota : le Map mémoire suffit pour la session JS */
  }
}

export function getMemberPhotoEditCache(
  memberId: string,
): MemberPhotoEditCacheEntry | null {
  const warm = memory.get(memberId);
  if (warm) {
    return warm;
  }
  try {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }
    const raw = sessionStorage.getItem(SS_KEY(memberId));
    if (!raw) {
      return null;
    }
    const entry = JSON.parse(raw) as MemberPhotoEditCacheEntry;
    memory.set(memberId, entry);
    return entry;
  } catch {
    return null;
  }
}

export function clearMemberPhotoEditCache(memberId: string) {
  memory.delete(memberId);
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SS_KEY(memberId));
    }
  } catch {
    /* ignore */
  }
}

/** Prépare une URL utilisable après fermeture du drawer (blob: → data:). */
export async function imageSrcToStorableDataUrl(src: string): Promise<string> {
  if (src.startsWith('data:')) {
    return src;
  }
  if (src.startsWith('blob:')) {
    const blob = await fetch(src).then((r) => r.blob());
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  }
  const res = await fetch(src, { mode: 'cors' });
  if (!res.ok) {
    throw new Error('fetch basis');
  }
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}
