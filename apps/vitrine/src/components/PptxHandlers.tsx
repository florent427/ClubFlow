'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Wrapper client qui active les interactions des figures PPTX (plein écran,
 * cycle de lecteurs PDF ↔ Office ↔ Google Docs) à l'intérieur de ses
 * enfants.
 *
 * Les figures sont sérialisées côté admin (extension Tiptap VitrinePptx)
 * en HTML brut avec des `<button data-pptx-action="...">` ; pour que ces
 * boutons fonctionnent côté public, il faut attacher un listener de
 * délégation sur un container au montage.
 *
 * Ordre du cycle « ↻ Autre lecteur » :
 *   - Si un PDF de preview est dispo (généré par LibreOffice côté API) :
 *     PDF → Office → Google → PDF. Le PDF est prioritaire parce qu'il
 *     marche partout (rendu natif navigateur), les deux autres servent de
 *     roue de secours.
 *   - Sinon : Office ↔ Google.
 */

type ViewerKind = 'pdf' | 'office' | 'google';

function officeEmbedUrl(fileUrl: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
}
function googleViewUrl(fileUrl: string): string {
  return `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=true`;
}
function pdfViewUrl(pdfUrl: string): string {
  return `${pdfUrl}#view=FitH&toolbar=1`;
}
function nextViewer(current: ViewerKind, hasPdf: boolean): ViewerKind {
  if (hasPdf) {
    if (current === 'pdf') return 'office';
    if (current === 'office') return 'google';
    return 'pdf';
  }
  return current === 'office' ? 'google' : 'office';
}

export function PptxHandlersBoundary({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;

    const handler = (event: Event): void => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const button = target.closest(
        '[data-pptx-action]',
      ) as HTMLElement | null;
      if (!button || !root.contains(button)) return;
      const action = button.getAttribute('data-pptx-action');
      const figure = button.closest(
        '.tiptap-pptx-figure',
      ) as HTMLElement | null;
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
        if (next === 'pdf' && pdfUrl) nextUrl = pdfViewUrl(pdfUrl);
        else if (next === 'google' && fileUrl) nextUrl = googleViewUrl(fileUrl);
        else if (fileUrl) nextUrl = officeEmbedUrl(fileUrl);
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
  }, []);

  return <div ref={ref}>{children}</div>;
}
