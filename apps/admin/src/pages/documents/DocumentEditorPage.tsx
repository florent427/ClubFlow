import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CLUB_DOCUMENT,
  UPSERT_CLUB_DOCUMENT_FIELDS,
} from '../../lib/documents-signature';
import type {
  ClubDocumentFieldType,
  ClubDocumentQueryData,
} from '../../lib/types';
import { useToast } from '../../components/ToastProvider';

/**
 * Champ en cours d'édition côté client. `id` undefined = nouveau (créé via
 * upsertClubDocumentFields). Toutes les coordonnées sont en % du format
 * de la page (0..1) — voir backend `ClubDocumentFieldInput`.
 */
type EditingField = {
  /** Id stable côté client pour la sélection / clé React. */
  uid: string;
  /** Id côté backend si déjà persisté. */
  id?: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fieldType: ClubDocumentFieldType;
  required: boolean;
  label: string | null;
  sortOrder: number;
};

const FIELD_TYPE_LABEL: Record<ClubDocumentFieldType, string> = {
  SIGNATURE: 'Signature',
  TEXT: 'Texte',
  DATE: 'Date',
  CHECKBOX: 'Case à cocher',
};

const FIELD_TYPE_COLOR: Record<
  ClubDocumentFieldType,
  { background: string; border: string }
> = {
  SIGNATURE: {
    background: 'rgba(34, 197, 94, 0.15)',
    border: '#16a34a',
  },
  TEXT: {
    background: 'rgba(59, 130, 246, 0.15)',
    border: '#2563eb',
  },
  DATE: {
    background: 'rgba(168, 85, 247, 0.15)',
    border: '#7c3aed',
  },
  CHECKBOX: {
    background: 'rgba(234, 179, 8, 0.15)',
    border: '#ca8a04',
  },
};

const DEFAULT_DIMS: Record<
  ClubDocumentFieldType,
  { width: number; height: number }
> = {
  // Valeurs en % du format A4 — environ une zone signature de 50 mm × 18 mm,
  // un champ texte de 80 × 8 mm, etc. Ajustables ensuite par drag.
  SIGNATURE: { width: 0.25, height: 0.06 },
  TEXT: { width: 0.3, height: 0.035 },
  DATE: { width: 0.18, height: 0.035 },
  CHECKBOX: { width: 0.025, height: 0.02 },
};

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function genUid(): string {
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Éditeur visuel des champs positionnés sur un document PDF.
 *
 * Architecture :
 *   1. Charge `clubDocument(id)` (URL du PDF + fields existants).
 *   2. Charge le PDF via `pdfjs-dist` (worker copié dans /public).
 *   3. Render chaque page sur un <canvas> en injectant les overlays absolus
 *      des fields. Les coordonnées `x/y/width/height` sont en % (0..1) de la
 *      page — converties en pixels uniquement au moment du rendu.
 *   4. Drag & drop sur les fields pour bouger / poignée bottom-right pour
 *      resize. Sélection clic, suppression via "✕", édition label/required.
 *   5. Bouton "Enregistrer" persiste l'ensemble via
 *      `upsertClubDocumentFields(documentId, fields)` (replace-all).
 */
export function DocumentEditorPage() {
  const { id: documentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { data, loading, error } = useQuery<ClubDocumentQueryData>(
    CLUB_DOCUMENT,
    {
      variables: { id: documentId },
      skip: !documentId,
      fetchPolicy: 'cache-and-network',
    },
  );
  const [upsertFields, { loading: saving }] = useMutation(
    UPSERT_CLUB_DOCUMENT_FIELDS,
  );

  /** Index des pages PDF déjà rendues (canvas + dimensions). */
  const [pages, setPages] = useState<
    Array<{ width: number; height: number }>
  >([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const pageContainerRefs = useRef<Array<HTMLDivElement | null>>([]);
  /** Référence vers le PDFDocumentProxy pdf-js partagée entre les 2 effets. */
  const pdfDocRef = useRef<{
    numPages: number;
    getPage: (n: number) => Promise<{
      getViewport: (opts: { scale: number }) => { width: number; height: number };
      render: (opts: unknown) => { promise: Promise<void> };
    }>;
  } | null>(null);

  /** Liste des champs (existants + nouveaux). */
  const [fields, setFields] = useState<EditingField[]>([]);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  /**
   * Lorsqu'un type est armé via la palette, le prochain clic sur une page PDF
   * crée un nouveau field à cette position. `null` = mode déplacement / select.
   */
  const [armedType, setArmedType] = useState<ClubDocumentFieldType | null>(
    null,
  );

  /** Drag/resize en cours pour un field donné. */
  const dragRef = useRef<
    | {
        uid: string;
        mode: 'move' | 'resize';
        startMouseX: number;
        startMouseY: number;
        startX: number;
        startY: number;
        startW: number;
        startH: number;
        pageEl: HTMLDivElement;
      }
    | null
  >(null);

  // -- Chargement initial des fields existants ---------------------------------
  const documentRow = data?.clubDocument ?? null;
  /**
   * On charge les fields une seule fois par doc — sinon chaque refetch
   * écraserait les édits client en cours. Le clé d'identité est l'id du
   * document (la version reste la même pendant l'édition des fields).
   */
  const lastSeenDocIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!documentRow) return;
    if (lastSeenDocIdRef.current === documentRow.id) return;
    lastSeenDocIdRef.current = documentRow.id;
    setFields(
      documentRow.fields.map((f, idx) => ({
        uid: genUid(),
        id: f.id,
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        fieldType: f.fieldType,
        required: f.required,
        label: f.label,
        sortOrder: f.sortOrder ?? idx,
      })),
    );
  }, [documentRow]);

  /** Scale de rendu du PDF — partagé entre les 2 effets. */
  const PDF_SCALE = 1.5;

  // -- Effect 1 : Chargement du PDF + dimensions des pages --------------------
  // setPages déclenche le commit React qui monte les <canvas>. Le rendu réel
  // se fait dans Effect 2 qui dépend de pages.length (donc se déclenche
  // après que les refs soient peuplées).
  useEffect(() => {
    if (!documentRow?.mediaAssetUrl) return;
    let cancelled = false;
    setPdfLoading(true);
    setPdfError(null);
    pdfDocRef.current = null;

    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        // Le worker est copié dans /public/pdf.worker.min.mjs au build.
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        const loadingTask = pdfjs.getDocument(documentRow.mediaAssetUrl!);
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        // Stocke le PDF pour la 2e passe.
        pdfDocRef.current = pdf as unknown as typeof pdfDocRef.current;

        const newPages: Array<{ width: number; height: number }> = [];
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: PDF_SCALE });
          newPages.push({ width: viewport.width, height: viewport.height });
        }
        // Reset la liste de refs pour la nouvelle taille avant le commit.
        canvasRefs.current = new Array(newPages.length).fill(null);
        pageContainerRefs.current = new Array(newPages.length).fill(null);
        setPages(newPages);
        // setPdfLoading(false) sera déclenché par Effect 2 après le rendu.
      } catch (err) {
        if (cancelled) return;
        setPdfError(err instanceof Error ? err.message : 'PDF illisible');
        setPdfLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [documentRow?.mediaAssetUrl]);

  // -- Effect 2 : Rendu canvas une fois les pages dimensionnées + DOM monté --
  // Se déclenche quand `pages` change (donc après le commit React qui a posé
  // les <canvas> dans le DOM). Lit `pdfDocRef.current` posé par Effect 1.
  useEffect(() => {
    if (pages.length === 0) return;
    const pdf = pdfDocRef.current;
    if (!pdf) return;
    let cancelled = false;

    void (async () => {
      // Petit délai pour laisser React peupler les refs via callback ref.
      await new Promise((r) => requestAnimationFrame(r));

      for (let p = 1; p <= pdf.numPages; p++) {
        if (cancelled) return;
        const canvas = canvasRefs.current[p - 1];
        if (!canvas) continue;
        const page = await pdf.getPage(p);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: PDF_SCALE });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        try {
          await page.render({
            canvasContext: ctx,
            viewport,
            // canvas natif requis par l'API pdfjs-dist v5+.
            canvas,
          } as unknown as Parameters<typeof page.render>[0]).promise;
        } catch (err) {
          if (cancelled) return;
          setPdfError(
            err instanceof Error ? err.message : 'Erreur rendu PDF',
          );
          return;
        }
      }
      if (!cancelled) setPdfLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [pages]);

  // -- Création d'un nouveau field au clic sur le PDF -------------------------
  function onPageClick(
    e: React.MouseEvent<HTMLDivElement>,
    pageNum: number,
  ) {
    // On ignore si on est en train de cliquer sur un overlay existant
    // (event bubble depuis le field overlay).
    if (!armedType) return;
    const target = e.target as HTMLElement;
    if (target.dataset.fieldOverlay === 'true') return;

    const pageEl = pageContainerRefs.current[pageNum - 1];
    if (!pageEl) return;
    const rect = pageEl.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const yPct = (e.clientY - rect.top) / rect.height;
    const dims = DEFAULT_DIMS[armedType];
    const newField: EditingField = {
      uid: genUid(),
      page: pageNum,
      x: clamp01(xPct - dims.width / 2),
      y: clamp01(yPct - dims.height / 2),
      width: dims.width,
      height: dims.height,
      fieldType: armedType,
      required: armedType !== 'CHECKBOX',
      label: null,
      sortOrder: fields.length,
    };
    setFields((prev) => [...prev, newField]);
    setSelectedUid(newField.uid);
    setArmedType(null);
  }

  // -- Drag handlers ----------------------------------------------------------
  function onFieldMouseDown(
    e: React.MouseEvent<HTMLDivElement>,
    field: EditingField,
    mode: 'move' | 'resize',
  ) {
    e.stopPropagation();
    e.preventDefault();
    setSelectedUid(field.uid);
    const pageEl = pageContainerRefs.current[field.page - 1];
    if (!pageEl) return;
    dragRef.current = {
      uid: field.uid,
      mode,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startX: field.x,
      startY: field.y,
      startW: field.width,
      startH: field.height,
      pageEl,
    };
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
  }

  function onWindowMouseMove(e: MouseEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = drag.pageEl.getBoundingClientRect();
    const dx = (e.clientX - drag.startMouseX) / rect.width;
    const dy = (e.clientY - drag.startMouseY) / rect.height;
    setFields((prev) =>
      prev.map((f) => {
        if (f.uid !== drag.uid) return f;
        if (drag.mode === 'move') {
          return {
            ...f,
            x: clamp01(drag.startX + dx),
            y: clamp01(drag.startY + dy),
          };
        }
        // resize : grow from origin, conservant x/y
        const minSize = 0.005;
        const w = Math.max(minSize, drag.startW + dx);
        const h = Math.max(minSize, drag.startH + dy);
        return {
          ...f,
          width: clamp01(w + f.x) - f.x,
          height: clamp01(h + f.y) - f.y,
        };
      }),
    );
  }

  function onWindowMouseUp() {
    dragRef.current = null;
    window.removeEventListener('mousemove', onWindowMouseMove);
    window.removeEventListener('mouseup', onWindowMouseUp);
  }

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
    // L'EventListener prend la closure au mount ; rien à mémoïser de plus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- Mutations sur les fields -----------------------------------------------
  function deleteField(uid: string) {
    setFields((prev) => prev.filter((f) => f.uid !== uid));
    if (selectedUid === uid) setSelectedUid(null);
  }

  function updateField(uid: string, patch: Partial<EditingField>) {
    setFields((prev) =>
      prev.map((f) => (f.uid === uid ? { ...f, ...patch } : f)),
    );
  }

  async function onSave() {
    if (!documentId) return;
    try {
      await upsertFields({
        variables: {
          documentId,
          fields: fields.map((f, idx) => ({
            page: f.page,
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
            fieldType: f.fieldType,
            required: f.required,
            label: f.label,
            sortOrder: idx,
          })),
        },
      });
      showToast(`${fields.length} champ(s) enregistré(s).`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  const selected = useMemo(
    () => fields.find((f) => f.uid === selectedUid) ?? null,
    [fields, selectedUid],
  );

  if (!documentId) {
    return <p>Document introuvable.</p>;
  }

  if (error) {
    return <p className="form-error">{error.message}</p>;
  }

  if (loading && !documentRow) {
    return <p className="cf-muted">Chargement du document…</p>;
  }

  if (!documentRow) {
    return <p className="form-error">Document introuvable.</p>;
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">
              <Link to="/documents">← Documents à signer</Link>
            </p>
            <h1 className="members-loom__title">{documentRow.name}</h1>
            <p className="members-loom__subtitle">
              Édite les zones interactives. Version v{documentRow.version}.
              {fields.length} champ{fields.length > 1 ? 's' : ''} positionné
              {fields.length > 1 ? 's' : ''}.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => navigate('/documents')}
            >
              Retour
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void onSave()}
              disabled={saving || pdfLoading}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '260px 1fr',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* Palette + détails du field sélectionné */}
        <aside
          style={{
            position: 'sticky',
            top: 12,
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: 16,
            background: '#fff',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 14 }}>Ajouter un champ</h3>
          <p
            className="cf-muted"
            style={{ margin: 0, fontSize: 12 }}
          >
            Clique sur un type, puis clique sur le PDF pour positionner.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
            }}
          >
            {(Object.keys(FIELD_TYPE_LABEL) as ClubDocumentFieldType[]).map(
              (t) => {
                const isArmed = armedType === t;
                const palette = FIELD_TYPE_COLOR[t];
                return (
                  <button
                    key={t}
                    type="button"
                    className="btn-ghost btn-tight"
                    onClick={() => setArmedType(isArmed ? null : t)}
                    style={{
                      borderColor: isArmed ? palette.border : undefined,
                      background: isArmed ? palette.background : undefined,
                      fontWeight: isArmed ? 600 : 500,
                    }}
                  >
                    {FIELD_TYPE_LABEL[t]}
                  </button>
                );
              },
            )}
          </div>
          {armedType ? (
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: FIELD_TYPE_COLOR[armedType].border,
              }}
            >
              Mode armé : <strong>{FIELD_TYPE_LABEL[armedType]}</strong>.
              Clique sur le PDF pour ajouter.
            </p>
          ) : null}

          {selected ? (
            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid #e5e7eb',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 14 }}>
                Champ sélectionné
              </h3>
              <p style={{ margin: 0, fontSize: 12 }}>
                Type :{' '}
                <strong style={{ color: FIELD_TYPE_COLOR[selected.fieldType].border }}>
                  {FIELD_TYPE_LABEL[selected.fieldType]}
                </strong>
              </p>
              <p
                className="cf-muted"
                style={{ margin: 0, fontSize: 11 }}
              >
                Page {selected.page} · {(selected.x * 100).toFixed(1)}% ×{' '}
                {(selected.y * 100).toFixed(1)}%
              </p>
              <label className="cf-field" style={{ marginBottom: 0 }}>
                <span>Libellé (optionnel)</span>
                <input
                  type="text"
                  value={selected.label ?? ''}
                  maxLength={120}
                  onChange={(e) =>
                    updateField(selected.uid, {
                      label: e.target.value || null,
                    })
                  }
                  placeholder="Ex: Signature responsable légal"
                />
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.required}
                  onChange={(e) =>
                    updateField(selected.uid, { required: e.target.checked })
                  }
                />
                <span>Champ obligatoire</span>
              </label>
              <button
                type="button"
                className="btn-ghost btn-tight btn-ghost--danger"
                onClick={() => deleteField(selected.uid)}
              >
                Supprimer ce champ
              </button>
            </div>
          ) : (
            <p
              className="cf-muted"
              style={{ margin: 0, fontSize: 12 }}
            >
              Sélectionne un champ existant pour modifier son libellé / le
              supprimer.
            </p>
          )}
        </aside>

        {/* Viewer PDF */}
        <section
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: 16,
            background: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
          }}
        >
          {pdfError ? (
            <p className="form-error">Erreur PDF : {pdfError}</p>
          ) : null}
          {pdfLoading && pages.length === 0 ? (
            <p className="cf-muted">Chargement du PDF…</p>
          ) : null}
          {pages.map((p, i) => {
            const pageNum = i + 1;
            const pageFields = fields.filter((f) => f.page === pageNum);
            return (
              <div key={pageNum} style={{ position: 'relative' }}>
                <div
                  style={{
                    fontSize: 11,
                    color: '#64748b',
                    marginBottom: 4,
                  }}
                >
                  Page {pageNum} / {pages.length}
                </div>
                <div
                  ref={(el) => {
                    pageContainerRefs.current[i] = el;
                  }}
                  onClick={(e) => onPageClick(e, pageNum)}
                  style={{
                    position: 'relative',
                    width: p.width,
                    height: p.height,
                    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.1)',
                    cursor: armedType ? 'crosshair' : 'default',
                    background: '#fff',
                  }}
                >
                  <canvas
                    ref={(el) => {
                      canvasRefs.current[i] = el;
                    }}
                    style={{ display: 'block', width: '100%', height: '100%' }}
                  />
                  {pageFields.map((f) => (
                    <FieldOverlay
                      key={f.uid}
                      field={f}
                      pageWidth={p.width}
                      pageHeight={p.height}
                      selected={f.uid === selectedUid}
                      onMouseDownMove={(e) =>
                        onFieldMouseDown(e, f, 'move')
                      }
                      onMouseDownResize={(e) =>
                        onFieldMouseDown(e, f, 'resize')
                      }
                      onSelect={() => setSelectedUid(f.uid)}
                      onDelete={() => deleteField(f.uid)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </>
  );
}

function FieldOverlay({
  field,
  pageWidth,
  pageHeight,
  selected,
  onMouseDownMove,
  onMouseDownResize,
  onSelect,
  onDelete,
}: {
  field: EditingField;
  pageWidth: number;
  pageHeight: number;
  selected: boolean;
  onMouseDownMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseDownResize: (e: React.MouseEvent<HTMLDivElement>) => void;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const palette = FIELD_TYPE_COLOR[field.fieldType];
  const style: CSSProperties = {
    position: 'absolute',
    left: field.x * pageWidth,
    top: field.y * pageHeight,
    width: field.width * pageWidth,
    height: field.height * pageHeight,
    background: palette.background,
    border: `2px ${selected ? 'solid' : 'dashed'} ${palette.border}`,
    boxShadow: selected ? '0 0 0 2px rgba(15, 23, 42, 0.2)' : undefined,
    cursor: 'move',
    fontSize: 11,
    color: palette.border,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none',
    overflow: 'hidden',
  };
  return (
    <div
      data-field-overlay="true"
      style={style}
      onMouseDown={onMouseDownMove}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      title={field.label ?? FIELD_TYPE_LABEL[field.fieldType]}
    >
      <span data-field-overlay="true" style={{ pointerEvents: 'none' }}>
        {field.label ?? FIELD_TYPE_LABEL[field.fieldType]}
        {field.required ? ' *' : ''}
      </span>
      {selected ? (
        <>
          <button
            type="button"
            data-field-overlay="true"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Supprimer"
            style={{
              position: 'absolute',
              top: -10,
              right: -10,
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: '1px solid #ef4444',
              background: '#fff',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: 12,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            ×
          </button>
          <div
            data-field-overlay="true"
            onMouseDown={onMouseDownResize}
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: 12,
              height: 12,
              background: palette.border,
              cursor: 'nwse-resize',
            }}
            title="Redimensionner"
          />
        </>
      ) : null}
    </div>
  );
}
