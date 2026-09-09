import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardList, CardListItem } from './CardList';

/**
 * Ce que ces tests protègent : sur mobile, la carte remplace la ligne de
 * tableau cliquable. Toute sa surface doit ouvrir l'élément (tap, Entrée,
 * Espace) — sauf la zone d'actions, sinon le bouton « message » ouvrirait la
 * fiche en même temps.
 */
describe('CardListItem', () => {
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
  });

  function mount(onOpen: () => void, onAction?: () => void) {
    act(() =>
      root.render(
        <CardList>
          <CardListItem
            title="Ada Lovelace"
            subtitle="ada@example.org"
            onOpen={onOpen}
            trailing={
              onAction ? (
                <button type="button" data-testid="action" onClick={onAction}>
                  Message
                </button>
              ) : undefined
            }
          />
        </CardList>,
      ),
    );
  }

  function click(el: Element) {
    act(() => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  it('un tap sur le titre ouvre l’élément', () => {
    const onOpen = vi.fn();
    mount(onOpen);
    click(container.querySelector('.cf-cardlist__title')!);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('un tap sur la zone d’actions déclenche l’action, pas l’ouverture', () => {
    const onOpen = vi.fn();
    const onAction = vi.fn();
    mount(onOpen, onAction);
    click(container.querySelector('[data-testid="action"]')!);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('la carte est atteignable et activable au clavier', () => {
    const onOpen = vi.fn();
    mount(onOpen);
    const row = container.querySelector('.cf-cardlist__row')!;
    expect(row.getAttribute('role')).toBe('button');
    expect(row.getAttribute('tabindex')).toBe('0');
    act(() => {
      row.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
    });
    act(() => {
      row.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true }),
      );
    });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('sans onOpen, la carte est statique : ni rôle bouton ni chevron', () => {
    act(() =>
      root.render(
        <CardList>
          <CardListItem title="Statique" />
        </CardList>,
      ),
    );
    const row = container.querySelector('.cf-cardlist__row')!;
    expect(row.getAttribute('role')).toBeNull();
    expect(container.querySelector('.cf-cardlist__chevron')).toBeNull();
  });
});
