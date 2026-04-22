import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef, useState } from 'react';
import { getClubId, getToken } from '../../lib/storage';
import { ResizableImage } from './ResizableImageExtension';

interface Props {
  value: string; // HTML initial
  onChange: (html: string) => void;
  placeholder?: string;
  /** Taille mini approximative en caractères (affichée en pied). */
  minChars?: number;
  disabled?: boolean;
}

function apiBase(): string {
  return (
    (import.meta.env as Record<string, string | undefined>)
      .VITE_GRAPHQL_HTTP?.replace(/\/graphql.*$/, '') ?? 'http://localhost:3000'
  );
}

/**
 * Éditeur rich-text WYSIWYG basé sur Tiptap.
 *
 * UX :
 * - Barre d'outils sticky en haut : undo/redo, titres (H1/H2/H3), gras/italique/
 *   souligné, listes, citation, code, alignements, lien, image, ligne horizontale.
 * - Upload d'image direct via POST /media/upload (MediaAssetsService).
 * - Support contenu HTML pur (format: 'html') en entrée/sortie.
 */
export function TiptapEditor({
  value,
  onChange,
  placeholder = 'Commencez à rédiger\u2026',
  minChars,
  disabled,
}: Props) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkHref, setLinkHref] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      ResizableImage.configure({ inline: false, allowBase64: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder, emptyEditorClass: 'is-empty' }),
    ],
    content: value || '<p></p>',
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Resynchroniser quand la valeur change depuis l'extérieur (ex. apply AI draft).
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value && value !== current) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return <p className="muted">Initialisation\u2026</p>;

  async function handleImageUpload(
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
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
      editor.chain().focus().setImage({ src: asset.publicUrl, alt: file.name }).run();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Échec upload');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function applyLink(): void {
    if (!editor) return;
    const href = linkHref.trim();
    if (!href) {
      editor.chain().focus().unsetLink().run();
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href })
        .run();
    }
    setLinkDialogOpen(false);
    setLinkHref('');
  }

  const plainText = editor.getText();
  const charCount = plainText.length;
  const wordCount = plainText.trim() ? plainText.trim().split(/\s+/).length : 0;

  return (
    <div className="tiptap-wrap">
      <Toolbar
        editor={editor}
        onOpenLink={() => {
          const existing = editor.getAttributes('link').href as
            | string
            | undefined;
          setLinkHref(existing ?? '');
          setLinkDialogOpen(true);
        }}
        onUploadImage={() => fileInputRef.current?.click()}
        uploading={uploading}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => void handleImageUpload(e)}
      />
      <div className="tiptap-editor">
        <EditorContent editor={editor} />
      </div>
      <div
        style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--border, #e5e7eb)',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          color: '#64748b',
          background: '#fafafa',
        }}
      >
        <span>
          {wordCount} mots · {charCount} caractères
        </span>
        {minChars && charCount < minChars ? (
          <span style={{ color: '#b45309' }}>
            Minimum recommandé : {minChars} caractères
          </span>
        ) : null}
      </div>

      {linkDialogOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLinkDialogOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 3000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: '#fff',
              padding: 20,
              borderRadius: 12,
              minWidth: 340,
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Ajouter / modifier un lien</h3>
            <input
              type="url"
              value={linkHref}
              onChange={(e) => setLinkHref(e.target.value)}
              placeholder="https://exemple.fr"
              autoFocus
              style={{
                width: '100%',
                padding: 8,
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
                boxSizing: 'border-box',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyLink();
                if (e.key === 'Escape') setLinkDialogOpen(false);
              }}
            />
            <p style={{ fontSize: 12, color: '#64748b', margin: '8px 0' }}>
              Laissez vide pour retirer le lien.
            </p>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 12,
              }}
            >
              <button
                type="button"
                className="btn btn-tight btn-ghost"
                onClick={() => setLinkDialogOpen(false)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-tight"
                onClick={applyLink}
              >
                Appliquer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Toolbar({
  editor,
  onOpenLink,
  onUploadImage,
  uploading,
}: {
  editor: Editor;
  onOpenLink: () => void;
  onUploadImage: () => void;
  uploading: boolean;
}) {
  const btn = (
    label: string,
    onClick: () => void,
    active = false,
    title?: string,
    disabled = false,
  ) => (
    <button
      type="button"
      className={active ? 'tiptap-btn tiptap-btn--active' : 'tiptap-btn'}
      onClick={onClick}
      title={title ?? label}
      disabled={disabled}
    >
      {label}
    </button>
  );

  return (
    <div className="tiptap-toolbar">
      <div className="tiptap-toolbar__group">
        {btn(
          '↶',
          () => editor.chain().focus().undo().run(),
          false,
          'Annuler (Ctrl+Z)',
          !editor.can().undo(),
        )}
        {btn(
          '↷',
          () => editor.chain().focus().redo().run(),
          false,
          'Rétablir (Ctrl+Y)',
          !editor.can().redo(),
        )}
      </div>

      <div className="tiptap-toolbar__group">
        <select
          className="tiptap-btn tiptap-btn--wide"
          value={
            editor.isActive('heading', { level: 1 })
              ? 'h1'
              : editor.isActive('heading', { level: 2 })
                ? 'h2'
                : editor.isActive('heading', { level: 3 })
                  ? 'h3'
                  : 'p'
          }
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'p') editor.chain().focus().setParagraph().run();
            else {
              const level = Number(v.slice(1)) as 1 | 2 | 3;
              editor.chain().focus().setHeading({ level }).run();
            }
          }}
        >
          <option value="p">Paragraphe</option>
          <option value="h1">Titre H1</option>
          <option value="h2">Titre H2</option>
          <option value="h3">Titre H3</option>
        </select>
      </div>

      <div className="tiptap-toolbar__group">
        {btn(
          'B',
          () => editor.chain().focus().toggleBold().run(),
          editor.isActive('bold'),
          'Gras (Ctrl+B)',
        )}
        {btn(
          'I',
          () => editor.chain().focus().toggleItalic().run(),
          editor.isActive('italic'),
          'Italique (Ctrl+I)',
        )}
        {btn(
          'U',
          () => editor.chain().focus().toggleUnderline().run(),
          editor.isActive('underline'),
          'Souligné (Ctrl+U)',
        )}
        {btn(
          'S',
          () => editor.chain().focus().toggleStrike().run(),
          editor.isActive('strike'),
          'Barré',
        )}
        {btn(
          '</>',
          () => editor.chain().focus().toggleCode().run(),
          editor.isActive('code'),
          'Code inline',
        )}
      </div>

      <div className="tiptap-toolbar__group">
        {btn(
          '•',
          () => editor.chain().focus().toggleBulletList().run(),
          editor.isActive('bulletList'),
          'Liste à puces',
        )}
        {btn(
          '1.',
          () => editor.chain().focus().toggleOrderedList().run(),
          editor.isActive('orderedList'),
          'Liste numérotée',
        )}
        {btn(
          '"',
          () => editor.chain().focus().toggleBlockquote().run(),
          editor.isActive('blockquote'),
          'Citation',
        )}
        {btn(
          '{ }',
          () => editor.chain().focus().toggleCodeBlock().run(),
          editor.isActive('codeBlock'),
          'Bloc de code',
        )}
      </div>

      <div className="tiptap-toolbar__group">
        {btn(
          '⇤',
          () => editor.chain().focus().setTextAlign('left').run(),
          editor.isActive({ textAlign: 'left' }),
          'Aligner à gauche',
        )}
        {btn(
          '↔',
          () => editor.chain().focus().setTextAlign('center').run(),
          editor.isActive({ textAlign: 'center' }),
          'Centrer',
        )}
        {btn(
          '⇥',
          () => editor.chain().focus().setTextAlign('right').run(),
          editor.isActive({ textAlign: 'right' }),
          'Aligner à droite',
        )}
        {btn(
          '≡',
          () => editor.chain().focus().setTextAlign('justify').run(),
          editor.isActive({ textAlign: 'justify' }),
          'Justifier',
        )}
      </div>

      <div className="tiptap-toolbar__group">
        {btn(
          '🔗',
          onOpenLink,
          editor.isActive('link'),
          'Lien',
        )}
        {btn(
          uploading ? '…' : '🖼',
          onUploadImage,
          false,
          'Insérer une image',
          uploading,
        )}
        {btn(
          '—',
          () => editor.chain().focus().setHorizontalRule().run(),
          false,
          'Ligne horizontale',
        )}
      </div>
    </div>
  );
}
