import type { ModuleCodeStr } from '../lib/module-catalog';

/**
 * Onglets de la barre basse mobile.
 *
 * Quatre destinations du quotidien ; le cinquième emplacement est le bouton
 * « Menu » (rendu par `MobileTabBar`) qui ouvre la navigation complète.
 * Les onglets liés à un module suivent le même grisage que la sidenav :
 * module désactivé → onglet inerte, pas de redirection surprise vers « / ».
 */
export interface MobileTab {
  to: string;
  label: string;
  /** Icône Material Symbols (outline). */
  icon: string;
  /** Correspondance exacte — l'accueil « / » matcherait tout sinon. */
  end?: boolean;
  /** Modules requis, tous actifs. */
  modules?: ModuleCodeStr[];
}

export const MOBILE_TABS: readonly MobileTab[] = [
  { to: '/', label: 'Accueil', icon: 'dashboard', end: true },
  { to: '/members', label: 'Membres', icon: 'group', modules: ['MEMBERS'] },
  {
    to: '/planning',
    label: 'Planning',
    icon: 'calendar_today',
    modules: ['PLANNING'],
  },
  { to: '/agent', label: 'Aïko', icon: 'smart_toy' },
];

/** Un onglet est actif sur sa route et sur ses sous-routes (sauf `end`). */
export function tabIsActive(tab: MobileTab, pathname: string): boolean {
  if (tab.end || tab.to === '/') return pathname === tab.to;
  return pathname === tab.to || pathname.startsWith(`${tab.to}/`);
}
