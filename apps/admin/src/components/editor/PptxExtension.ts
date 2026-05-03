import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Extension Tiptap pour insérer un lecteur PPTX inline dans un article.
 *
 * L'utilisateur upload un fichier `.pptx` (ou `.ppt` / `.odp`) via le bouton
 * de la toolbar — `MediaAssetsService.uploadPresentationWithPdf` le stocke
 * ET tente une conversion **PPTX → PDF via LibreOffice headless**. Si la
 * conversion réussit, l'API renvoie l'URL du PDF en plus de celle du PPTX.
 *
 * Rendu, par ordre de préférence :
 *   1. **PDF** (`pdfSrc` présent) : `<iframe src="<pdf-url>#toolbar=1">`.
 *      Le PDF est rendu par le viewer natif du navigateur — fonctionne
 *      PARTOUT (localhost, behind-auth, staging, prod), supporte le plein
 *      écran natif, affichage fidèle, texte sélectionnable.
 *   2. **Office Online Viewer** (fallback, si pas de `pdfSrc`) :
 *      `<iframe src="view.officeapps.live.com/op/embed.aspx?src=...">`.
 *      Exige que l'URL du PPTX soit publique sur Internet (Office ne peut
 *      pas lire les URLs locales) — peu utile en dev mais utile si
 *      LibreOffice n'est pas installé sur le serveur.
 *
 * Toolbar :
 *   - ⛶ Plein écran (Fullscreen API)
 *   - ↻ Autre lecteur (bascule PDF ↔ Office ↔ Google Docs selon dispo)
 *   - ↗ Nouvel onglet (ouvre le lecteur courant)
 *   - ⬇ Télécharger (toujours le PPTX source)
 *
 * Les actions sont câblées via `attachPptxToolbarHandlers()` (éditeur admin)
 * et `PptxHandlersBoundary` (site vitrine public).
 */

export interface PptxAttributes {
  /** URL publique du fichier .pptx (source, toujours pour le téléchargement). */
  src: string;
  /**
   * URL publique du PDF de preview (généré côté serveur via LibreOffice).
   * Optionnelle — si null, le rendu retombe sur Office Online Viewer.
   */
  pdfSrc: string | null;
  /** Titre affiché en légende + attribut title de l'iframe. */
  title: string | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    vitrinePptx: {
      insertVitrinePptx: (attrs: Partial<PptxAttributes>) => ReturnType;
    };
  }
}

function officeEmbedUrl(fileUrl: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
}

export const VitrinePptx = Node.create<Record<string, never>>({
  name: 'vitrinePptx',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) =>
          el.getAttribute('data-src') ??
          el.querySelector('a[data-pptx-action="download"]')?.getAttribute('href') ??
          null,
      },
      pdfSrc: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-pdf-src'),
      },
      title: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-title'),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'figure.tiptap-pptx-figure' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const src = ((node.attrs.src as string | null) ?? '').trim();
    const pdfSrc = ((node.attrs.pdfSrc as string | null) ?? '').trim();
    const title = ((node.attrs.title as string | null) ?? 'Présentation').trim();

    // Viewer préféré : PDF natif si disponible, sinon Office Online en
    // fallback. L'URL initiale de l'iframe + le bouton « Nouvel onglet »
    // pointent sur ce lecteur ; le bouton « Autre lecteur » fait tourner
    // parmi les options dispo.
    const initialViewer: 'pdf' | 'office' = pdfSrc ? 'pdf' : 'office';
    const initialSrc =
      initialViewer === 'pdf'
        ? `${pdfSrc}#view=FitH&toolbar=1`
        : src
          ? officeEmbedUrl(src)
          : '';

    const figureAttrs = mergeAttributes(HTMLAttributes, {
      class: 'tiptap-pptx-figure',
      'data-src': src,
      'data-pdf-src': pdfSrc || '',
      'data-title': title,
    });

    return [
      'figure',
      figureAttrs,
      [
        'div',
        { class: 'tiptap-pptx__toolbar' },
        [
          'button',
          {
            type: 'button',
            'data-pptx-action': 'fullscreen',
            class: 'tiptap-pptx__btn',
            title: 'Afficher en plein écran',
          },
          '⛶',
          ' Plein écran',
        ],
        [
          'button',
          {
            type: 'button',
            'data-pptx-action': 'toggle-viewer',
            class: 'tiptap-pptx__btn',
            title:
              'Basculer entre le PDF de prévisualisation, Microsoft Office Online et Google Docs Viewer.',
          },
          '↻',
          ' Autre lecteur',
        ],
        [
          'a',
          {
            href: initialSrc,
            target: '_blank',
            rel: 'noopener noreferrer',
            'data-pptx-action': 'open-new',
            class: 'tiptap-pptx__btn',
            title: 'Ouvrir le lecteur dans un nouvel onglet',
          },
          '↗',
          ' Nouvel onglet',
        ],
        [
          'a',
          {
            href: src,
            download: '',
            target: '_blank',
            rel: 'noopener',
            'data-pptx-action': 'download',
            class: 'tiptap-pptx__btn tiptap-pptx__btn--accent',
            title: 'Télécharger le fichier .pptx original',
          },
          '⬇',
          ' Télécharger',
        ],
      ],
      [
        'iframe',
        {
          src: initialSrc,
          'data-pptx-file': src,
          'data-pptx-pdf': pdfSrc || '',
          'data-pptx-viewer': initialViewer,
          title: title || 'Présentation',
          frameborder: '0',
          loading: 'lazy',
          allowfullscreen: '',
          referrerpolicy: 'strict-origin-when-cross-origin',
        },
      ],
      ['figcaption', { class: 'tiptap-pptx-figcaption' }, title],
    ];
  },

  addCommands() {
    return {
      insertVitrinePptx:
        (attrs) =>
        ({ commands }) => {
          const src = (attrs.src ?? '').trim();
          if (!src) return false;
          return commands.insertContent({
            type: this.name,
            attrs: {
              src,
              pdfSrc: attrs.pdfSrc ?? null,
              title: attrs.title ?? null,
            },
          });
        },
    };
  },
});

type ViewerKind = 'pdf' | 'office' | 'google';

function officeEmbedUrlFor(fileUrl: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
}
function googleViewUrlFor(fileUrl: string): string {
  return `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=true`;
}
function pdfViewUrlFor(pdfUrl: string): string {
  return `${pdfUrl}#view=FitH&toolbar=1`;
}

/**
 * Retourne l'ordre de cycle « ↻ Autre lecteur » : on boucle parmi les
 * lecteurs dispo. Si un PDF de preview existe, on préfère l'ordre
 * PDF → Office → Google → PDF ; sinon Office → Google → Office.
 */
function nextViewer(
  current: ViewerKind,
  hasPdf: boolean,
): ViewerKind {
  if (hasPdf) {
    if (current === 'pdf') return 'office';
    if (current === 'office') return 'google';
    return 'pdf';
  }
  return current === 'office' ? 'google' : 'office';
}

/**
 * Installe un listener de délégation sur `root` pour gérer les actions
 * `data-pptx-action` des figures PPTX (fullscreen, bascule viewer, ouvrir
 * dans un onglet). À appeler une fois au montage du composant (éditeur
 * admin OU article vitrine) ; le cleanup retourné détache le listener.
 */
export function attachPptxToolbarHandlers(root: HTMLElement): () => void {
  const handler = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const button = target.closest(
      '[data-pptx-action]',
    ) as HTMLElement | null;
    if (!button || !root.contains(button)) return;
    const action = button.getAttribute('data-pptx-action');
    const figure = button.closest('.tiptap-pptx-figure') as HTMLElement | null;
    if (!figure) return;

    if (action === 'fullscreen') {
      event.preventDefault();
      const iframe = figure.querySelector('iframe');
      const targetEl = (iframe as HTMLElement | null) ?? figure;
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void targetEl.requestFullscreen?.();
      }
      return;
    }

    if (action === 'toggle-viewer') {
      event.preventDefault();
      const iframe = figure.querySelector(
        'iframe[data-pptx-viewer]',
      ) as HTMLIFrameElement | null;
      if (!iframe) return;
      const fileUrl = iframe.getAttribute('data-pptx-file') ?? '';
      const pdfUrl = iframe.getAttribute('data-pptx-pdf') ?? '';
      const current =
        (iframe.getAttribute('data-pptx-viewer') as ViewerKind | null) ??
        'office';
      const next = nextViewer(current, Boolean(pdfUrl));
      let nextUrl = '';
      if (next === 'pdf' && pdfUrl) nextUrl = pdfViewUrlFor(pdfUrl);
      else if (next === 'google' && fileUrl)
        nextUrl = googleViewUrlFor(fileUrl);
      else if (fileUrl) nextUrl = officeEmbedUrlFor(fileUrl);
      if (!nextUrl) return;
      iframe.setAttribute('src', nextUrl);
      iframe.setAttribute('data-pptx-viewer', next);
      const openNewTabLink = figure.querySelector(
        'a[data-pptx-action="open-new"]',
      ) as HTMLAnchorElement | null;
      if (openNewTabLink) openNewTabLink.setAttribute('href', nextUrl);
    }
    // download / open-new : comportement natif du lien.
  };
  root.addEventListener('click', handler);
  return () => {
    root.removeEventListener('click', handler);
  };
}
