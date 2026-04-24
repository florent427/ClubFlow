import type { ModuleCodeStr } from '../lib/module-catalog';

/**
 * Configuration déclarative de la navigation admin.
 *
 * La structure est volontairement simple : sections → items → subs.
 * `AdminLayout` la rend via une boucle unique, ce qui évite la répétition
 * historique (20+ `ModuleGatedNavLink` hardcodés) et facilite l'ajout
 * d'un nouveau module (édite cette config, pas de JSX à toucher).
 */

export interface NavSubItem {
  /** URL target (matches `NavLink.to`). */
  to: string;
  /** Libellé court affiché dans le sous-menu. */
  label: string;
  /** Modules requis pour afficher l'item (filtre via `ClubModulesContext`). */
  modules?: ModuleCodeStr[];
  /** `end` pour la correspondance exacte (ex: /members vs /members/grades). */
  end?: boolean;
}

export interface NavItem {
  /** URL target. Cliquer l'item navigue ici même s'il a des enfants. */
  to: string;
  /** Libellé principal. */
  label: string;
  /** Icône Material Symbols (outline). */
  icon: string;
  /** Modules requis pour afficher l'item. */
  modules?: ModuleCodeStr[];
  /** Sous-items expandables. Si présents, l'item affiche un chevron. */
  children?: NavSubItem[];
  /** `end` pour la correspondance exacte. */
  end?: boolean;
}

export interface NavSection {
  /** Identifiant stable pour mémoriser le collapse dans localStorage. */
  id: string;
  /** Label uppercase du header de section. Vide = pas de header (section racine). */
  label: string;
  /** Items de la section. */
  items: NavItem[];
  /** Si true, la section démarre collapsed par défaut (override-able par user). */
  defaultCollapsed?: boolean;
}

/**
 * Sections affichées en haut de la sidebar, sans header (racine).
 * Navigation quotidienne à accès rapide.
 */
export const PINNED_ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'Tableau de bord',
    icon: 'dashboard',
    end: true,
  },
  {
    to: '/agent',
    label: 'Aïko · Agent IA',
    icon: 'smart_toy',
  },
];

/**
 * Sections thématiques. L'ordre reflète la journée-type d'un admin de club :
 *   communauté → activités → communication → finance → commerce.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'community',
    label: 'Communauté',
    items: [
      {
        to: '/members',
        label: 'Membres',
        icon: 'group',
        modules: ['MEMBERS'],
        end: true,
        children: [
          { to: '/members', label: 'Annuaire', end: true, modules: ['MEMBERS'] },
          { to: '/members/grades', label: 'Grades', modules: ['MEMBERS'] },
          {
            to: '/members/dynamic-groups',
            label: 'Groupes dynamiques',
            modules: ['MEMBERS'],
          },
          { to: '/members/roles', label: 'Rôles', modules: ['MEMBERS'] },
          {
            to: '/members/families',
            label: 'Familles',
            modules: ['MEMBERS', 'FAMILIES'],
          },
          {
            to: '/members/adhesions',
            label: 'Adhésions',
            modules: ['MEMBERS', 'PAYMENT'],
          },
        ],
      },
      {
        to: '/contacts',
        label: 'Contacts',
        icon: 'contacts',
        modules: ['MEMBERS'],
      },
      {
        to: '/settings/adhesion',
        label: 'Adhésion & formules',
        icon: 'groups',
        modules: ['MEMBERS', 'PAYMENT'],
      },
    ],
  },
  {
    id: 'activities',
    label: 'Activités',
    items: [
      {
        to: '/planning',
        label: 'Planning sportif',
        icon: 'calendar_today',
        modules: ['PLANNING'],
      },
      {
        to: '/evenements',
        label: 'Événements',
        icon: 'event',
        modules: ['EVENTS'],
      },
      {
        to: '/projets',
        label: 'Projets',
        icon: 'rocket_launch',
        modules: ['PROJECTS'],
      },
      {
        to: '/reservations',
        label: 'Réservations',
        icon: 'event_available',
        modules: ['BOOKING'],
      },
    ],
  },
  {
    id: 'communication',
    label: 'Communication',
    items: [
      {
        to: '/communication',
        label: 'Campagnes',
        icon: 'campaign',
        modules: ['COMMUNICATION'],
      },
      {
        to: '/vie-du-club',
        label: 'Vie du club',
        icon: 'forum',
        modules: ['CLUB_LIFE'],
      },
      {
        to: '/blog',
        label: 'Blog interne',
        icon: 'article',
        modules: ['BLOG'],
      },
      {
        to: '/vitrine',
        label: 'Site vitrine',
        icon: 'public',
        end: true,
        children: [
          { to: '/vitrine', label: 'Accueil vitrine', end: true },
          { to: '/vitrine/articles', label: 'Articles & actus' },
          { to: '/vitrine/categories', label: 'Catégories' },
          { to: '/vitrine/commentaires', label: 'Commentaires' },
          { to: '/vitrine/galerie', label: 'Galerie' },
          { to: '/vitrine/medias', label: 'Médiathèque' },
          { to: '/vitrine/branding', label: 'Identité visuelle' },
          { to: '/vitrine/settings', label: 'Paramètres vitrine' },
        ],
      },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    items: [
      {
        to: '/billing',
        label: 'Facturation',
        icon: 'payments',
        modules: ['PAYMENT'],
      },
      {
        to: '/comptabilite',
        label: 'Comptabilité',
        icon: 'account_balance',
        modules: ['ACCOUNTING'],
      },
      {
        to: '/sponsoring',
        label: 'Sponsoring',
        icon: 'handshake',
        modules: ['SPONSORING'],
      },
      {
        to: '/subventions',
        label: 'Subventions',
        icon: 'volunteer_activism',
        modules: ['SUBSIDIES'],
      },
    ],
  },
  {
    id: 'commerce',
    label: 'Commerce',
    items: [
      {
        to: '/boutique',
        label: 'Boutique',
        icon: 'storefront',
        modules: ['SHOP'],
      },
    ],
  },
];

/**
 * Section fixée en bas de la sidebar, avant le user-card.
 * Configuration technique + déconnexion.
 */
export const ADMIN_FOOTER_ITEMS: NavItem[] = [
  {
    to: '/club-modules',
    label: 'Modules du club',
    icon: 'extension',
  },
  {
    to: '/settings',
    label: 'Paramètres',
    icon: 'settings',
    end: true,
  },
];
