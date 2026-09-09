import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOBILE_MEDIA_QUERY, useIsMobile } from './use-media-query';

/**
 * Ce que ces tests protègent : le shell rend la barre d'onglets, la feuille
 * de navigation et les listes en cartes d'après `useIsMobile()`. S'il
 * répondait `true` en desktop, ignorait un redimensionnement ou gardait ses
 * écouteurs après démontage, le mauvais layout resterait à l'écran sans la
 * moindre erreur.
 */

type ChangeListener = (e: { matches: boolean }) => void;

/** Faux `matchMedia` pilotable : jsdom n'en fournit pas. */
function installMatchMedia(initial: boolean) {
  const listeners = new Set<ChangeListener>();
  let matches = initial;
  const mql = {
    get matches() {
      return matches;
    },
    media: MOBILE_MEDIA_QUERY,
    addEventListener: (_type: 'change', l: ChangeListener) => {
      listeners.add(l);
    },
    removeEventListener: (_type: 'change', l: ChangeListener) => {
      listeners.delete(l);
    },
  };
  const matchMedia = vi.fn((query: string) => {
    if (query !== MOBILE_MEDIA_QUERY) {
      throw new Error(`media query inattendue : ${query}`);
    }
    return mql;
  });
  vi.stubGlobal('matchMedia', matchMedia);
  return {
    resize(next: boolean) {
      matches = next;
      for (const l of listeners) l({ matches });
    },
    listenerCount: () => listeners.size,
  };
}

function Probe() {
  return <span data-mobile={String(useIsMobile())} />;
}

describe('useIsMobile', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function mount() {
    act(() => root.render(<Probe />));
  }

  function value(): string | null {
    return container.querySelector('span')?.getAttribute('data-mobile') ?? null;
  }

  it('répond false sur une fenêtre desktop', () => {
    installMatchMedia(false);
    mount();
    expect(value()).toBe('false');
  });

  it('répond true sur une fenêtre étroite', () => {
    installMatchMedia(true);
    mount();
    expect(value()).toBe('true');
  });

  it('suit le redimensionnement de la fenêtre dans les deux sens', () => {
    const media = installMatchMedia(false);
    mount();
    expect(value()).toBe('false');
    act(() => media.resize(true));
    expect(value()).toBe('true');
    act(() => media.resize(false));
    expect(value()).toBe('false');
  });

  it("retire son écouteur au démontage — pas d'état mis à jour dans le vide", () => {
    const media = installMatchMedia(false);
    mount();
    expect(media.listenerCount()).toBe(1);
    act(() => root.unmount());
    expect(media.listenerCount()).toBe(0);
    // Le afterEach démontera une racine déjà vide : rendu sans effet.
    root = createRoot(container);
  });

  it('répond false sans matchMedia plutôt que de planter', () => {
    vi.stubGlobal('matchMedia', undefined);
    mount();
    expect(value()).toBe('false');
  });
});
