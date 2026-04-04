import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  cacheEntryMatchesValue,
  clearMemberPhotoEditCache,
  getMemberPhotoEditCache,
  imageSrcToStorableDataUrl,
  photoValueFingerprint,
  photoValueHash,
  setMemberPhotoEditCache,
} from './member-photo-edit-cache';

/** Data URL finale : taille max approximative de chaîne. */
const MAX_DATA_URL_CHARS = 480_000;
const OUTPUT_SIZE = 512;
const VIEWPORT_PX = 280;
/** Zoom minimal du curseur = cadrage « plein cadre » (1× le scale cover). La source reste en mémoire ; on peut revenir à ce point comme à l’ouverture. */
const ZOOM_MIN = 1;
/** Identique à ZOOM_MIN : référence mémorisée pour Annuler / réinitialisation. */
const ZOOM_BASE = 1;
const ZOOM_MAX = 3;

function revokeIfObjectUrl(url: string | null) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

function fileToObjectUrl(file: File): string {
  return URL.createObjectURL(file);
}

function renderCropToJpegDataUrl(
  img: HTMLImageElement,
  viewportSize: number,
  dispW: number,
  dispH: number,
  left: number,
  top: number,
  quality = 0.88,
): string {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh) {
    return '';
  }
  const S = viewportSize;
  const scale = OUTPUT_SIZE / S;
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return '';
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  const vx0 = Math.max(0, left);
  const vy0 = Math.max(0, top);
  const vx1 = Math.min(S, left + dispW);
  const vy1 = Math.min(S, top + dispH);
  if (vx1 <= vx0 || vy1 <= vy0) {
    let q = quality;
    let data = canvas.toDataURL('image/jpeg', q);
    while (data.length > MAX_DATA_URL_CHARS && q > 0.38) {
      q -= 0.06;
      data = canvas.toDataURL('image/jpeg', q);
    }
    return data;
  }

  const u0 = Math.max(0, Math.floor(((vx0 - left) / dispW) * nw));
  const u1 = Math.min(nw, Math.ceil(((vx1 - left) / dispW) * nw));
  const v0 = Math.max(0, Math.floor(((vy0 - top) / dispH) * nh));
  const v1 = Math.min(nh, Math.ceil(((vy1 - top) / dispH) * nh));
  const sw = Math.max(1, u1 - u0);
  const sh = Math.max(1, v1 - v0);
  const dx = vx0 * scale;
  const dy = vy0 * scale;
  const dw = (vx1 - vx0) * scale;
  const dh = (vy1 - vy0) * scale;
  ctx.drawImage(img, u0, v0, sw, sh, dx, dy, dw, dh);

  let q = quality;
  let data = canvas.toDataURL('image/jpeg', q);
  while (data.length > MAX_DATA_URL_CHARS && q > 0.38) {
    q -= 0.06;
    data = canvas.toDataURL('image/jpeg', q);
  }
  return data;
}

function clamp(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n));
}

export type MemberPhotoFieldProps = {
  value: string;
  onChange: (next: string) => void;
  idPrefix?: string;
  /** Si défini (ex. id membre), zoom/pan + image d’édition survivent à la fermeture du drawer. */
  persistenceKey?: string;
};

/**
 * Photo : aperçu statique, clic pour recadrer / zoomer, Valider ou Annuler.
 */
export function MemberPhotoField({
  value,
  onChange,
  idPrefix = 'member-photo',
  persistenceKey,
}: MemberPhotoFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const lastEmittedRef = useRef<string | null>(null);
  const dragRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);
  /** Zoom / pan au moment d’ouvrir le mode recadrage (mémoire pour Annuler). */
  const editBaselineRef = useRef({ zoom: ZOOM_BASE, pan: { x: 0, y: 0 } });
  /**
   * Bitmap utilisée dans le recadrage : fichier / URL d’origine, jamais remplacée par le JPEG validé.
   * Sinon après validation seul le carré exporté reste → impossible de retrouver le plein cadre initial.
   */
  const editBasisRef = useRef<string | null>(null);
  /** Dernier zoom / pan validés : réappliqués à la réouverture (superposition sur la photo importée). */
  const lastSavedCropRef = useRef<{
    zoom: number;
    pan: { x: number; y: number };
  } | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  /** Import ou URL chargée pas encore validé(e) côté parent. */
  const [stagedImport, setStagedImport] = useState(false);

  const [workingSrc, setWorkingSrc] = useState<string | null>(null);
  const [imgReady, setImgReady] = useState(false);
  const [zoom, setZoom] = useState(ZOOM_BASE);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [urlDraft, setUrlDraft] = useState('');
  /** URL affichée dans l’éditeur (sync React ; alignée sur editBasisRef à l’ouverture). */
  const [cropperSrc, setCropperSrc] = useState<string | null>(null);

  const blobCleanupRef = useRef<(() => void) | null>(null);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const imgReadyRef = useRef(imgReady);

  useEffect(() => {
    zoomRef.current = zoom;
    panRef.current = pan;
    imgReadyRef.current = imgReady;
  }, [zoom, pan, imgReady]);

  const clearBlobSource = useCallback(() => {
    if (blobCleanupRef.current) {
      blobCleanupRef.current();
      blobCleanupRef.current = null;
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- synchro contrôlée props `value` / cache crop */
  useEffect(() => {
    if (!value) {
      lastEmittedRef.current = null;
      clearBlobSource();
      editBasisRef.current = null;
      lastSavedCropRef.current = null;
      /** Ne pas appeler clearMemberPhotoEditCache ici : au remontage du drawer, `value` est
       *  souvent `''` un instant avant la sync parent → cela effaçait tout le cache. Le cache
       *  est vidé sur « Retirer la photo », nouvel import / URL, ou entrée incohérente (fp). */
      setCropperSrc(null);
      setWorkingSrc(null);
      setImgReady(false);
      setNatural({ w: 0, h: 0 });
      setZoom(ZOOM_BASE);
      setPan({ x: 0, y: 0 });
      setUrlDraft('');
      setStagedImport(false);
      setIsEditing(false);
      return;
    }
    if (value === lastEmittedRef.current) {
      setWorkingSrc(value);
      setStagedImport(false);
      return;
    }
    clearBlobSource();
    lastEmittedRef.current = null;
    setCropperSrc(null);
    setWorkingSrc(value);
    setImgReady(false);
    setStagedImport(false);
    setIsEditing(false);
    setUrlDraft(/^https?:\/\//i.test(value) ? value : '');

    let restored = false;
    if (persistenceKey) {
      const cached = getMemberPhotoEditCache(persistenceKey);
      if (cached && cacheEntryMatchesValue(cached, value)) {
        editBasisRef.current = cached.basis;
        lastSavedCropRef.current = {
          zoom: cached.zoom,
          pan: { ...cached.pan },
        };
        lastEmittedRef.current = value;
        restored = true;
      }
    }
    if (!restored) {
      editBasisRef.current = null;
      lastSavedCropRef.current = null;
      setZoom(ZOOM_BASE);
      setPan({ x: 0, y: 0 });
    } else {
      setZoom(lastSavedCropRef.current!.zoom);
      setPan({ ...lastSavedCropRef.current!.pan });
    }
  }, [value, clearBlobSource, persistenceKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const coverScale =
    natural.w > 0 && natural.h > 0
      ? Math.max(VIEWPORT_PX / natural.w, VIEWPORT_PX / natural.h)
      : 1;
  const totalScale = coverScale * zoom;
  const dispW = natural.w * totalScale;
  const dispH = natural.h * totalScale;
  const left0 = (VIEWPORT_PX - dispW) / 2;
  const top0 = (VIEWPORT_PX - dispH) / 2;
  const left = left0 + pan.x;
  const top = top0 + pan.y;

  const clampPanToCover = useCallback(
    (px: number, py: number, z: number) => {
      if (!natural.w || !natural.h) {
        return { x: 0, y: 0 };
      }
      const ts = coverScale * z;
      const w = natural.w * ts;
      const h = natural.h * ts;
      const l0 = (VIEWPORT_PX - w) / 2;
      const t0 = (VIEWPORT_PX - h) / 2;
      const minL = Math.min(0, VIEWPORT_PX - w);
      const maxL = Math.max(0, VIEWPORT_PX - w);
      const minT = Math.min(0, VIEWPORT_PX - h);
      const maxT = Math.max(0, VIEWPORT_PX - h);
      const l = clamp(l0 + px, minL, maxL);
      const t = clamp(t0 + py, minT, maxT);
      return { x: l - l0, y: t - t0 };
    },
    [natural.w, natural.h, coverScale],
  );

  const emitCrop = useCallback(() => {
    const img = imgRef.current;
    if (!img || !natural.w || !imgReady || !cropperSrc) {
      return;
    }
    try {
      const out = renderCropToJpegDataUrl(
        img,
        VIEWPORT_PX,
        dispW,
        dispH,
        left,
        top,
      );
      if (!out || out.length > MAX_DATA_URL_CHARS) {
        window.alert('Export photo impossible (image trop lourde ou illisible).');
        return false;
      }
      lastEmittedRef.current = out;
      onChange(out);
      return true;
    } catch {
      window.alert(
        'Impossible d’exporter le recadrage (image externe : essayez d’importer le fichier à la place).',
      );
      return false;
    }
  }, [natural.w, imgReady, cropperSrc, dispW, dispH, left, top, onChange]);

  const beginEditSession = useCallback(() => {
    const saved = lastSavedCropRef.current;
    const z = saved?.zoom ?? ZOOM_BASE;
    const px = saved?.pan.x ?? 0;
    const py = saved?.pan.y ?? 0;
    setZoom(z);
    setPan({ x: px, y: py });
    editBaselineRef.current = { zoom: z, pan: { x: px, y: py } };
    setImgReady(false);
    setNatural({ w: 0, h: 0 });
    setIsEditing(true);
  }, []);

  const openEditor = useCallback(() => {
    const src = workingSrc || value;
    if (!src) {
      return;
    }
    if (!workingSrc && value) {
      setWorkingSrc(value);
    }
    if (persistenceKey) {
      const c = getMemberPhotoEditCache(persistenceKey);
      if (c && cacheEntryMatchesValue(c, value || src)) {
        editBasisRef.current = c.basis;
        lastSavedCropRef.current = {
          zoom: c.zoom,
          pan: { ...c.pan },
        };
      }
    }
    if (!editBasisRef.current) {
      editBasisRef.current = src;
    }
    setCropperSrc(editBasisRef.current);
    beginEditSession();
  }, [workingSrc, value, beginEditSession, persistenceKey]);

  const validateEdit = useCallback(async () => {
    const basisSrc = cropperSrc;
    const z = zoomRef.current;
    const p = { x: panRef.current.x, y: panRef.current.y };

    if (!emitCrop()) {
      return;
    }

    const out = lastEmittedRef.current;
    if (!out) {
      return;
    }

    lastSavedCropRef.current = { zoom: z, pan: p };

    if (persistenceKey && basisSrc) {
      const meta = {
        zoom: z,
        pan: p,
        valueFp: photoValueFingerprint(out),
        valueHash: photoValueHash(out),
      };
      try {
        const basis = await imageSrcToStorableDataUrl(basisSrc);
        setMemberPhotoEditCache(persistenceKey, { basis, ...meta });
      } catch {
        if (basisSrc.startsWith('data:')) {
          setMemberPhotoEditCache(persistenceKey, { basis: basisSrc, ...meta });
        }
      }
    }

    setStagedImport(false);
    setIsEditing(false);
    setWorkingSrc(out);
  }, [emitCrop, persistenceKey, cropperSrc]);

  /** Recentre le zoom 1× sur l’import (sans fermer) ; Annuler reste aligné sur l’état à l’ouverture de session. */
  const resetToFullFrame = useCallback(() => {
    if (!isEditing || !imgReady) {
      return;
    }
    setZoom(ZOOM_BASE);
    setPan(clampPanToCover(0, 0, ZOOM_BASE));
  }, [isEditing, imgReady, clampPanToCover]);

  const cancelEdit = useCallback(() => {
    const b = editBaselineRef.current;
    setZoom(b.zoom);
    setPan({ ...b.pan });
    setIsEditing(false);
    if (stagedImport) {
      editBasisRef.current = null;
      lastSavedCropRef.current = null;
      if (persistenceKey) {
        clearMemberPhotoEditCache(persistenceKey);
      }
      setCropperSrc(null);
      if (!value) {
        clearBlobSource();
        setWorkingSrc(null);
        setUrlDraft('');
      } else {
        clearBlobSource();
        setWorkingSrc(value);
      }
      setStagedImport(false);
    }
  }, [stagedImport, value, clearBlobSource, persistenceKey]);

  const onImgLoad = useCallback(() => {
    const el = imgRef.current;
    if (!el) {
      return;
    }
    setNatural({ w: el.naturalWidth, h: el.naturalHeight });
    setImgReady(true);
  }, []);

  useEffect(() => {
    if (!isEditing || !imgReady || !natural.w) {
      return;
    }
    setPan((p) => clampPanToCover(p.x, p.y, zoomRef.current));
  }, [isEditing, imgReady, natural.w, natural.h, clampPanToCover]);

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f?.type.startsWith('image/')) {
        return;
      }
      clearBlobSource();
      const url = fileToObjectUrl(f);
      blobCleanupRef.current = () => revokeIfObjectUrl(url);
      lastEmittedRef.current = null;
      lastSavedCropRef.current = null;
      if (persistenceKey) {
        clearMemberPhotoEditCache(persistenceKey);
      }
      editBasisRef.current = url;
      setCropperSrc(url);
      setWorkingSrc(url);
      setStagedImport(true);
      setUrlDraft('');
      beginEditSession();
    },
    [clearBlobSource, beginEditSession, persistenceKey],
  );

  useEffect(() => () => clearBlobSource(), [clearBlobSource]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isEditing || !imgReady) {
        return;
      }
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    },
    [isEditing, imgReady, pan.x, pan.y],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.id) {
        return;
      }
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const next = clampPanToCover(d.panX + dx, d.panY + dy, zoom);
      setPan(next);
    },
    [zoom, clampPanToCover],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d && e.pointerId === d.id) {
      dragRef.current = null;
    }
  }, []);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el || !isEditing) {
      return;
    }
    const onWheel = (e: WheelEvent) => {
      if (!imgReadyRef.current) {
        return;
      }
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      const z = zoomRef.current;
      const nz = clamp(z + delta, ZOOM_MIN, ZOOM_MAX);
      if (nz === z) {
        return;
      }
      const p = panRef.current;
      const np = clampPanToCover(p.x, p.y, nz);
      setZoom(nz);
      setPan(np);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [isEditing, clampPanToCover]);

  const removePhoto = useCallback(() => {
    clearBlobSource();
    lastEmittedRef.current = null;
    editBasisRef.current = null;
    lastSavedCropRef.current = null;
    if (persistenceKey) {
      clearMemberPhotoEditCache(persistenceKey);
    }
    setCropperSrc(null);
    setWorkingSrc(null);
    setImgReady(false);
    setNatural({ w: 0, h: 0 });
    setPan({ x: 0, y: 0 });
    setZoom(ZOOM_BASE);
    setUrlDraft('');
    setStagedImport(false);
    setIsEditing(false);
    onChange('');
  }, [clearBlobSource, onChange, persistenceKey]);

  const loadHttpUrl = useCallback(() => {
    const t = urlDraft.trim();
    if (!t) {
      removePhoto();
      return;
    }
    if (!/^https?:\/\//i.test(t)) {
      window.alert('Utilisez une adresse commençant par http:// ou https://');
      return;
    }
    clearBlobSource();
    lastEmittedRef.current = null;
    lastSavedCropRef.current = null;
    if (persistenceKey) {
      clearMemberPhotoEditCache(persistenceKey);
    }
    editBasisRef.current = t;
    setCropperSrc(t);
    setWorkingSrc(t);
    setStagedImport(true);
    setNatural({ w: 0, h: 0 });
    beginEditSession();
  }, [urlDraft, clearBlobSource, removePhoto, beginEditSession, persistenceKey]);

  const staticPreviewUrl = stagedImport && workingSrc ? workingSrc : value || workingSrc || '';

  const viewportClass = `member-photo-crop__viewport${isEditing && imgReady ? ' member-photo-crop__viewport--ready' : ''}${!isEditing && staticPreviewUrl ? ' member-photo-crop__viewport--static' : ''}`;

  return (
    <div className="member-photo-field">
      <span className="member-photo-field__label">Photo</span>

      {!isEditing ? (
        <div
          className={viewportClass}
          style={{ width: VIEWPORT_PX, height: VIEWPORT_PX }}
          onClick={() => void openEditor()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openEditor();
            }
          }}
          role="button"
          tabIndex={staticPreviewUrl ? 0 : -1}
          aria-label={
            staticPreviewUrl
              ? 'Ouvrir le recadrage et le zoom'
              : 'Aucune image'
          }
        >
          {staticPreviewUrl ? (
            <img
              src={staticPreviewUrl}
              alt=""
              className="member-photo-crop__static-preview"
              draggable={false}
            />
          ) : (
            <div className="member-photo-crop__empty">Aperçu</div>
          )}
          {staticPreviewUrl ? (
            <span className="member-photo-crop__static-hint">
              Cliquer pour recadrer / zoomer
            </span>
          ) : null}
        </div>
      ) : (
        <>
          <div
            ref={viewportRef}
            className={viewportClass}
            style={{ width: VIEWPORT_PX, height: VIEWPORT_PX }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            role="presentation"
          >
            {cropperSrc ? (
              <img
                key={`crop-${cropperSrc}`}
                ref={imgRef}
                src={cropperSrc}
                alt=""
                className="member-photo-crop__img"
                crossOrigin={
                  /^https?:\/\//i.test(cropperSrc) ? 'anonymous' : undefined
                }
                draggable={false}
                style={{
                  width: dispW,
                  height: dispH,
                  left,
                  top,
                }}
                onLoad={onImgLoad}
                onError={() => {
                  setImgReady(false);
                  window.alert(
                    'Impossible de charger cette image (lien cassé ou blocage multi-origine).',
                  );
                }}
              />
            ) : (
              <div className="member-photo-crop__empty">Chargement…</div>
            )}
          </div>

          <label className="member-photo-field__zoom">
            <span className="muted">Zoom (recadrage)</span>
            <input
              type="range"
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={0.02}
              value={zoom}
              disabled={!imgReady}
              onChange={(e) => {
                const nz = Number(e.target.value);
                setZoom(nz);
                setPan((p) => clampPanToCover(p.x, p.y, nz));
              }}
            />
          </label>

          <div className="member-photo-field__edit-actions">
            <button
              type="button"
              className="btn btn-ghost btn-tight"
              disabled={!imgReady}
              onClick={() => resetToFullFrame()}
            >
              Plein cadre
            </button>
            <button
              type="button"
              className="btn btn-primary btn-tight"
              disabled={!imgReady}
              onClick={() => void validateEdit()}
            >
              Valider le recadrage
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-tight"
              onClick={() => cancelEdit()}
            >
              Annuler
            </button>
          </div>
        </>
      )}

      <div className="member-photo-field__row">
        <div className="member-photo-field__actions member-photo-field__actions--full">
          <input
            ref={fileRef}
            id={`${idPrefix}-file`}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => void onPick(e)}
          />
          <input
            ref={camRef}
            id={`${idPrefix}-cam`}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => void onPick(e)}
          />
          <button
            type="button"
            className="btn btn-ghost btn-tight"
            onClick={() => fileRef.current?.click()}
          >
            Importer une image
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-tight"
            onClick={() => camRef.current?.click()}
          >
            Prendre une photo
          </button>
          {value || workingSrc ? (
            <button
              type="button"
              className="btn btn-ghost btn-tight"
              onClick={removePhoto}
            >
              Retirer la photo
            </button>
          ) : null}
        </div>
      </div>

      <div className="field member-photo-field__url">
        <span className="muted">Ou adresse web (https://), puis « Charger »</span>
        <div className="member-photo-field__url-row">
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                loadHttpUrl();
              }
            }}
            placeholder="https://exemple.org/photo.jpg"
          />
          <button
            type="button"
            className="btn btn-ghost btn-tight"
            onClick={() => loadHttpUrl()}
          >
            Charger
          </button>
        </div>
      </div>

      <p className="muted member-photo-field__hint">
        {isEditing
          ? 'La photo importée sert de calque : après validation, un nouveau clic rouvre le même zoom, la même position et le même cadrage. « Plein cadre » remet le zoom à 1× centré. Annuler abandonne les changements depuis cette ouverture.'
          : staticPreviewUrl
            ? 'Cliquez sur la photo pour recadrer ou zoomer ; validez pour enregistrer le nouveau cadrage dans la fiche.'
            : 'Importez une image ou saisissez une URL pour commencer.'}
      </p>
    </div>
  );
}
