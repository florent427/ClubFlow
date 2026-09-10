import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { ModuleCodeStr } from '../lib/module-catalog';
import { MobileTabBarView } from './MobileTabBar';
import { MOBILE_TABS, tabIsActive } from './mobile-tabs';

/**
 * Ce que ces tests protègent : sur mobile, la barre d'onglets est le
 * premier repère de navigation. Un onglet actif au mauvais endroit, un module
 * désactivé encore cliquable (→ redirection muette vers l'accueil) ou un
 * bouton Menu qui ne dit pas son état seraient invisibles au typecheck.
 */

function render({
  currentPath,
  isEnabled = () => true,
  navOpen = false,
}: {
  currentPath: string;
  isEnabled?: ((code: ModuleCodeStr) => boolean) | null;
  navOpen?: boolean;
}): Document {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={[currentPath]}>
      <MobileTabBarView
        tabs={MOBILE_TABS}
        currentPath={currentPath}
        isEnabled={isEnabled}
        navOpen={navOpen}
        onToggleNav={() => {}}
      />
    </MemoryRouter>,
  );
  return new DOMParser().parseFromString(html, 'text/html');
}

function activeLabels(doc: Document): string[] {
  return [...doc.querySelectorAll('.cf-tabbar__item--active')].map(
    (el) => el.querySelector('.cf-tabbar__label')?.textContent ?? '',
  );
}

describe('tabIsActive', () => {
  const home = MOBILE_TABS[0];
  const members = MOBILE_TABS[1];

  it("l'accueil n'est actif que sur « / » exactement", () => {
    expect(tabIsActive(home, '/')).toBe(true);
    expect(tabIsActive(home, '/members')).toBe(false);
  });

  it('un onglet de module couvre ses sous-routes, pas ses voisins', () => {
    expect(tabIsActive(members, '/members')).toBe(true);
    expect(tabIsActive(members, '/members/grades')).toBe(true);
    expect(tabIsActive(members, '/membership')).toBe(false);
  });
});

describe('MobileTabBarView', () => {
  it('signale l’onglet de la page courante, et lui seul', () => {
    const doc = render({ currentPath: '/members/grades' });
    expect(activeLabels(doc)).toEqual(['Membres']);
    const link = doc.querySelector('a[href="/members"]');
    expect(link?.getAttribute('aria-current')).toBe('page');
  });

  it('rend les quatre destinations en liens et Menu en bouton', () => {
    const doc = render({ currentPath: '/' });
    const hrefs = [...doc.querySelectorAll('a.cf-tabbar__item')].map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toEqual(['/', '/members', '/planning', '/agent']);
    const menu = doc.querySelector('button.cf-tabbar__item');
    expect(menu?.getAttribute('aria-controls')).toBe('cf-sidenav');
    expect(menu?.getAttribute('aria-expanded')).toBe('false');
  });

  it('grise un onglet dont le module est désactivé, sans lien dessous', () => {
    const doc = render({
      currentPath: '/',
      isEnabled: (code) => code !== 'PLANNING',
    });
    expect(doc.querySelector('a[href="/planning"]')).toBeNull();
    const disabled = doc.querySelector('.cf-tabbar__item--disabled');
    expect(disabled?.getAttribute('aria-disabled')).toBe('true');
    expect(disabled?.textContent).toContain('Planning');
    // Les autres restent des liens.
    expect(doc.querySelector('a[href="/members"]')).not.toBeNull();
  });

  it('ne grise rien tant que les modules chargent', () => {
    const doc = render({ currentPath: '/', isEnabled: null });
    expect(doc.querySelector('.cf-tabbar__item--disabled')).toBeNull();
    expect(doc.querySelectorAll('a.cf-tabbar__item')).toHaveLength(4);
  });

  it('menu ouvert : Menu devient l’onglet courant et la page passe en retrait', () => {
    const doc = render({ currentPath: '/', navOpen: true });
    expect(activeLabels(doc)).toEqual(['Menu']);
    const menu = doc.querySelector('button.cf-tabbar__item');
    expect(menu?.getAttribute('aria-expanded')).toBe('true');
    expect(menu?.getAttribute('aria-label')).toBe('Fermer le menu');
  });
});
