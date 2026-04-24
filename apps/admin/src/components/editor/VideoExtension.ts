import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Extension Tiptap pour insérer des vidéos dans un article vitrine.
 *
 * Deux sources supportées :
 *   1. **Embed** YouTube / Vimeo / URL d'iframe externe — rendu <iframe>.
 *   2. **Fichier** uploadé via /media/upload?kind=video (MP4 / WebM / OGG /
 *      MOV) — rendu <video controls preload="metadata">.
 *
 * Le nœud sérialise en HTML un `<figure class="tiptap-video-figure"
 * data-provider="youtube|vimeo|file" data-align="center|left|right">` qui
 * encapsule soit un `<iframe>` soit un `<video>`. Le front public (site
 * vitrine) rend cet HTML tel quel (pas de traitement particulier ; le
 * responsive est géré par CSS `.tiptap-video-figure` + `position-relative
 * + aspect-ratio`).
 *
 * Les URLs YouTube / Vimeo sont normalisées automatiquement vers leur
 * forme d'embed officielle (évite qu'un utilisateur colle une URL
 * "watch?v=..." directement).
 */

export interface VideoAttributes {
  src: string;
  provider: 'youtube' | 'vimeo' | 'file' | 'iframe';
  title: string | null;
  align: 'left' | 'center' | 'right';
  width: string | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    vitrineVideo: {
      insertVitrineVideo: (attrs: Partial<VideoAttributes>) => ReturnType;
    };
  }
}

function detectProvider(url: string): VideoAttributes['provider'] {
  const u = url.trim().toLowerCase();
  if (!u) return 'iframe';
  if (/youtu\.?be/.test(u)) return 'youtube';
  if (/vimeo\.com/.test(u)) return 'vimeo';
  if (/\.(mp4|webm|ogg|ogv|mov)(\?|#|$)/.test(u)) return 'file';
  return 'iframe';
}

/**
 * Normalise une URL vers l'embed correspondant. YouTube:
 *   - youtube.com/watch?v=ID     → youtube.com/embed/ID
 *   - youtu.be/ID                → youtube.com/embed/ID
 *   - youtube.com/shorts/ID      → youtube.com/embed/ID
 *   - URL embed déjà normalisée  → inchangée
 * Vimeo:
 *   - vimeo.com/ID               → player.vimeo.com/video/ID
 *   - URL player déjà OK         → inchangée
 * Autres URLs iframe → retournées telles quelles.
 */
export function normalizeEmbedUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return url;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = parsed.pathname.replace(/^\//, '').split('/')[0];
      return `https://www.youtube.com/embed/${id}`;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname.startsWith('/embed/')) return url;
      const v = parsed.searchParams.get('v');
      if (v) return `https://www.youtube.com/embed/${v}`;
      const shortsMatch = parsed.pathname.match(/\/shorts\/([^/]+)/);
      if (shortsMatch) return `https://www.youtube.com/embed/${shortsMatch[1]}`;
    }
    if (host === 'vimeo.com') {
      const id = parsed.pathname.replace(/^\//, '').split('/')[0];
      if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
    return url;
  } catch {
    // URL invalide : on la laisse telle quelle, l'iframe sera silencieusement
    // cassée — pas de crash éditeur.
    return url;
  }
}

export const VitrineVideo = Node.create<Record<string, never>>({
  name: 'vitrineVideo',
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
          el.querySelector('iframe,video')?.getAttribute('src') ??
          el.querySelector('video source')?.getAttribute('src') ??
          null,
      },
      provider: {
        default: 'iframe' as VideoAttributes['provider'],
        parseHTML: (el) =>
          (el.getAttribute('data-provider') ??
            'iframe') as VideoAttributes['provider'],
      },
      title: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-title'),
      },
      align: {
        default: 'center' as VideoAttributes['align'],
        parseHTML: (el) =>
          (el.getAttribute('data-align') ??
            'center') as VideoAttributes['align'],
      },
      width: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-width'),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'figure.tiptap-video-figure' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const provider = node.attrs.provider as VideoAttributes['provider'];
    const src = (node.attrs.src as string | null) ?? '';
    const title = (node.attrs.title as string | null) ?? '';
    const align = (node.attrs.align as VideoAttributes['align']) ?? 'center';
    const width = (node.attrs.width as string | null) ?? null;

    const figureAttrs = mergeAttributes(HTMLAttributes, {
      class: 'tiptap-video-figure',
      'data-provider': provider,
      'data-src': src,
      'data-title': title,
      'data-align': align,
      ...(width ? { 'data-width': width } : {}),
    });

    const playerAttrs: Record<string, string | number | boolean> = {
      title: title || 'Vidéo',
      frameborder: '0',
      allow:
        'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
      allowfullscreen: '',
      loading: 'lazy',
      referrerpolicy: 'strict-origin-when-cross-origin',
    };

    if (provider === 'file') {
      return [
        'figure',
        figureAttrs,
        [
          'video',
          {
            controls: '',
            preload: 'metadata',
            playsinline: '',
            src,
            title: title || undefined,
          },
        ],
      ];
    }

    return [
      'figure',
      figureAttrs,
      [
        'iframe',
        {
          src,
          ...playerAttrs,
        },
      ],
    ];
  },

  addCommands() {
    return {
      insertVitrineVideo:
        (attrs) =>
        ({ commands }) => {
          const src = (attrs.src ?? '').trim();
          if (!src) return false;
          const provider: VideoAttributes['provider'] =
            attrs.provider ?? detectProvider(src);
          const normalizedSrc =
            provider === 'youtube' || provider === 'vimeo' || provider === 'iframe'
              ? normalizeEmbedUrl(src)
              : src;
          return commands.insertContent({
            type: this.name,
            attrs: {
              src: normalizedSrc,
              provider,
              title: attrs.title ?? null,
              align: attrs.align ?? 'center',
              width: attrs.width ?? null,
            },
          });
        },
    };
  },
});
