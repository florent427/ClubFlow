import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { getClubId, getToken } from '../../lib/storage';

type AlignValue = 'left' | 'center' | 'right' | 'wrap-left' | 'wrap-right';

function apiBase(): string {
  return (
    (import.meta.env as Record<string, string | undefined>)
      .VITE_GRAPHQL_HTTP?.replace(/\/graphql.*$/, '') ?? 'http://localhost:3000'
  );
}

/**
 * NodeView React pour les images dans Tiptap. Rend une `<figure>` avec l'image
 * et une barre flottante d'options au clic (tant que le node est sélectionné).
 *
 * Options :
 *   - Alignement : gauche / centré / droite / wrap-gauche / wrap-droite
 *   - Taille : 25% / 50% / 75% / 100% / largeur auto (clic sur le % en cours
 *     pour revenir auto)
 *   - Alt text (SEO + accessibilité)
 *   - Légende affichée sous l'image
 *   - Remplacer l'image (upload d'un fichier local qui remplace `src`)
 *   - Supprimer
 *
 * Les attributs sont persistés via `updateAttributes` (Tiptap propage à l'HTML
 * rendu par `renderHTML` de l'extension).
 */
export function ResizableImageView(props: NodeViewProps) {
  const { node, updateAttributes, selected, deleteNode, editor } = props;
  const src = (node.attrs.src as string) ?? '';
  const alt = (node.attrs.alt as string) ?? '';
  const align = ((node.attrs.align as string) ?? 'center') as AlignValue;
  const width = (node.attrs.width as string | null) ?? null;
  const caption = (node.attrs.caption as string | null) ?? null;

  const [editingAlt, setEditingAlt] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [draftAlt, setDraftAlt] = useState(alt);
  const [draftCaption, setDraftCaption] = useState(caption ?? '');
  const [uploading, setUploading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Upload d'un fichier local → remplace `src` (et `alt` si vide). */
  async function handleReplaceImage(
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
      const res = await fetch(`${apiBase()}/media/upload?kind=image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Club-Id': clubId,
        },
        body: form,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const asset = (await res.json()) as { id: string; publicUrl: string };
      updateAttributes({
        src: asset.publicUrl,
        // On remplace l'alt seulement s'il est vide (sinon l'alt IA/user
        // existant est préservé).
        ...(alt.trim() ? {} : { alt: file.name.replace(/\.[^.]+$/, '') }),
      });
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Échec de l'upload de l'image",
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  useEffect(() => {
    setDraftAlt(alt);
  }, [alt]);
  useEffect(() => {
    setDraftCaption(caption ?? '');
  }, [caption]);

  function setAlign(next: AlignValue): void {
    updateAttributes({ align: next });
  }
  function setWidth(next: string | null): void {
    updateAttributes({ width: next });
  }
  function commitAlt(): void {
    updateAttributes({ alt: draftAlt });
    setEditingAlt(false);
  }
  function commitCaption(): void {
    updateAttributes({ caption: draftCaption.trim() || null });
    setEditingCaption(false);
  }

  // Hover + selected déclenchent la toolbar (et reste visible quand on édite
  // l'alt / légende même si on perd temporairement la sélection).
  const [hover, setHover] = useState(false);
  const showToolbar = selected || hover || editingAlt || editingCaption;
  void editor; // evite unused-var warning

  return (
    <NodeViewWrapper
      className={`tiptap-img-figure tiptap-img-figure--editor tiptap-img-figure--align-${align}`}
      data-align={align}
      data-width={width ?? ''}
      data-selected={selected ? 'true' : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div ref={wrapperRef} className="tiptap-img-inner">
        <img
          src={src}
          alt={alt}
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
          }}
          draggable={false}
        />

        {showToolbar ? (
          <div
            className="tiptap-img-toolbar"
            contentEditable={false}
            onMouseDown={(e) => e.preventDefault()}
          >
            {/* Alignement */}
            <div className="tiptap-img-toolbar__group">
              <ToolBtn
                title="Aligner à gauche"
                active={align === 'left'}
                onClick={() => setAlign('left')}
              >
                ⇤
              </ToolBtn>
              <ToolBtn
                title="Centrer"
                active={align === 'center'}
                onClick={() => setAlign('center')}
              >
                ↔
              </ToolBtn>
              <ToolBtn
                title="Aligner à droite"
                active={align === 'right'}
                onClick={() => setAlign('right')}
              >
                ⇥
              </ToolBtn>
            </div>

            {/* Wrap texte */}
            <div className="tiptap-img-toolbar__group">
              <ToolBtn
                title="Habiller à gauche (texte à droite)"
                active={align === 'wrap-left'}
                onClick={() => setAlign('wrap-left')}
              >
                ◧
              </ToolBtn>
              <ToolBtn
                title="Habiller à droite (texte à gauche)"
                active={align === 'wrap-right'}
                onClick={() => setAlign('wrap-right')}
              >
                ◨
              </ToolBtn>
            </div>

            {/* Taille */}
            <div className="tiptap-img-toolbar__group">
              <WidthBtn
                title="Taille auto"
                active={width === null}
                onClick={() => setWidth(null)}
              >
                Auto
              </WidthBtn>
              <WidthBtn
                title="25%"
                active={width === '25%'}
                onClick={() => setWidth('25%')}
              >
                25
              </WidthBtn>
              <WidthBtn
                title="50%"
                active={width === '50%'}
                onClick={() => setWidth('50%')}
              >
                50
              </WidthBtn>
              <WidthBtn
                title="75%"
                active={width === '75%'}
                onClick={() => setWidth('75%')}
              >
                75
              </WidthBtn>
              <WidthBtn
                title="100%"
                active={width === '100%'}
                onClick={() => setWidth('100%')}
              >
                100
              </WidthBtn>
            </div>

            {/* Alt + caption */}
            <div className="tiptap-img-toolbar__group">
              <ToolBtn
                title="Alt text (SEO + accessibilité)"
                active={editingAlt}
                onClick={() => setEditingAlt((v) => !v)}
              >
                Alt
              </ToolBtn>
              <ToolBtn
                title="Légende"
                active={editingCaption}
                onClick={() => setEditingCaption((v) => !v)}
              >
                Lég.
              </ToolBtn>
            </div>

            {/* Remplacer + supprimer */}
            <div className="tiptap-img-toolbar__group">
              <ToolBtn
                title={uploading ? 'Upload en cours…' : "Remplacer l'image"}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? '…' : '↻'}
              </ToolBtn>
              <ToolBtn
                title="Supprimer l'image"
                onClick={() => deleteNode()}
                variant="danger"
              >
                ✕
              </ToolBtn>
            </div>
          </div>
        ) : null}

        {/* Input file caché, déclenché par le bouton "Remplacer" ci-dessus */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => void handleReplaceImage(e)}
        />
      </div>

      {/* Input alt éditable */}
      {showToolbar && editingAlt ? (
        <div
          className="tiptap-img-inline-input"
          contentEditable={false}
          onMouseDown={(e) => e.preventDefault()}
        >
          <label>Alt text</label>
          <input
            type="text"
            value={draftAlt}
            onChange={(e) => setDraftAlt(e.target.value)}
            onBlur={commitAlt}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitAlt();
              if (e.key === 'Escape') {
                setDraftAlt(alt);
                setEditingAlt(false);
              }
            }}
            autoFocus
            placeholder="Description de l'image\u2026"
          />
        </div>
      ) : null}

      {/* Légende : visible en permanence si définie, éditable en mode sélection */}
      {showToolbar && editingCaption ? (
        <div
          className="tiptap-img-inline-input"
          contentEditable={false}
          onMouseDown={(e) => e.preventDefault()}
        >
          <label>Légende</label>
          <input
            type="text"
            value={draftCaption}
            onChange={(e) => setDraftCaption(e.target.value)}
            onBlur={commitCaption}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCaption();
              if (e.key === 'Escape') {
                setDraftCaption(caption ?? '');
                setEditingCaption(false);
              }
            }}
            autoFocus
            placeholder="Légende affichée sous l'image\u2026"
          />
        </div>
      ) : caption ? (
        <figcaption className="tiptap-img-caption" contentEditable={false}>
          {caption}
        </figcaption>
      ) : null}
    </NodeViewWrapper>
  );
}

function ToolBtn({
  children,
  onClick,
  title,
  active,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  variant?: 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={
        'tiptap-img-tb-btn' +
        (active ? ' tiptap-img-tb-btn--active' : '') +
        (variant === 'danger' ? ' tiptap-img-tb-btn--danger' : '')
      }
    >
      {children}
    </button>
  );
}

function WidthBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={
        'tiptap-img-tb-btn tiptap-img-tb-btn--wide' +
        (active ? ' tiptap-img-tb-btn--active' : '')
      }
    >
      {children}
    </button>
  );
}
