import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ResizableImageView } from './ResizableImageView';

/**
 * Extension Tiptap qui étend Image pour ajouter :
 *   - `width` : largeur en % (`'25%' | '50%' | '75%' | '100%'`) ou `null` = auto.
 *   - `align` : `'left' | 'center' | 'right' | 'wrap-left' | 'wrap-right'`.
 *     - `left/center/right` = bloc aligné (le texte ne wrap pas).
 *     - `wrap-left/wrap-right` = image flottante, texte wrap autour.
 *   - `caption` : légende affichée sous l'image (dans un `<figcaption>`).
 *
 * Le rendu HTML utilise une structure `<figure data-align="..." data-width="...">`
 * contenant `<img>` + optionnel `<figcaption>`. Le site vitrine public la
 * restitue via `.article-prose` en CSS.
 */
export const ResizableImage = Image.extend({
  name: 'image', // on garde le nom "image" pour compatibilité avec le parser Tiptap

  // Autorise les figures comme ancrage du node
  draggable: true,
  inline: false,
  group: 'block',

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null as string | null,
        parseHTML: (el) => {
          const fig = el.closest('figure');
          return fig?.getAttribute('data-width') ?? el.getAttribute('data-width');
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          if (!attrs.width) return {};
          return { 'data-width': attrs.width as string };
        },
      },
      align: {
        default: 'center',
        parseHTML: (el) => {
          const fig = el.closest('figure');
          return (
            fig?.getAttribute('data-align') ??
            el.getAttribute('data-align') ??
            'center'
          );
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          return { 'data-align': (attrs.align as string) ?? 'center' };
        },
      },
      caption: {
        default: null as string | null,
        parseHTML: (el) => {
          const fig = el.closest('figure');
          const capNode = fig?.querySelector('figcaption');
          return capNode?.textContent?.trim() || null;
        },
      },
    };
  },

  // Rendu HTML final en sortie (stocké en DB et rendu sur la vitrine).
  // Important : la `width` (25/50/75/100%) est sur la FIGURE (pas sur
  // l'image), ainsi en mode wrap avec max-width 45% l'image remplit sa
  // figure sans double-division (ex. 50% × 50% = 25%).
  renderHTML({ node, HTMLAttributes }) {
    const align = (node.attrs.align as string) ?? 'center';
    const width = node.attrs.width as string | null;
    const caption = node.attrs.caption as string | null;

    const imgAttrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(HTMLAttributes)) {
      if (
        ['data-align', 'data-width', 'align', 'width', 'caption', 'style'].includes(k)
      )
        continue;
      if (v != null) imgAttrs[k] = String(v);
    }

    const figAttrs: Record<string, string> = {
      class: 'tiptap-img-figure',
      'data-align': align,
    };
    if (width) figAttrs['data-width'] = width;

    if (caption && caption.trim().length > 0) {
      return [
        'figure',
        figAttrs,
        ['img', imgAttrs],
        ['figcaption', {}, caption],
      ];
    }
    return ['figure', figAttrs, ['img', imgAttrs]];
  },

  // Parsing HTML en entrée (ex. paste, setContent)
  parseHTML() {
    return [
      {
        tag: 'figure.tiptap-img-figure',
        getAttrs: (el: HTMLElement) => {
          const img = el.querySelector('img');
          if (!img) return false;
          const cap = el.querySelector('figcaption');
          return {
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt'),
            title: img.getAttribute('title'),
            align: el.getAttribute('data-align') ?? 'center',
            width: el.getAttribute('data-width'),
            caption: cap?.textContent?.trim() || null,
          };
        },
      },
      {
        tag: 'img[src]',
        getAttrs: (el: HTMLElement) => ({
          src: el.getAttribute('src'),
          alt: el.getAttribute('alt'),
          title: el.getAttribute('title'),
          align: 'center',
          width: null,
          caption: null,
        }),
      },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});
