/**
 * Codes des modules ClubFlow — alignés avec `ModuleCode` enum API
 * (apps/api/src/domain/module-registry/module-codes.ts).
 */
export type ModuleCode =
  | 'MEMBERS'
  | 'FAMILIES'
  | 'PAYMENT'
  | 'PLANNING'
  | 'COMMUNICATION'
  | 'MESSAGING'
  | 'ACCOUNTING'
  | 'SUBSIDIES'
  | 'SPONSORING'
  | 'WEBSITE'
  | 'BLOG'
  | 'SHOP'
  | 'CLUB_LIFE'
  | 'EVENTS'
  | 'BOOKING'
  | 'PROJECTS'
  | 'DOCUMENTS';

export const ALL_MODULE_CODES: ModuleCode[] = [
  'MEMBERS',
  'FAMILIES',
  'PAYMENT',
  'PLANNING',
  'COMMUNICATION',
  'MESSAGING',
  'ACCOUNTING',
  'SUBSIDIES',
  'SPONSORING',
  'WEBSITE',
  'BLOG',
  'SHOP',
  'CLUB_LIFE',
  'EVENTS',
  'BOOKING',
  'PROJECTS',
  'DOCUMENTS',
];

/** Labels FR pour affichage UI. */
export const MODULE_LABELS: Record<ModuleCode, string> = {
  MEMBERS: 'Adhérents',
  FAMILIES: 'Familles',
  PAYMENT: 'Paiements',
  PLANNING: 'Planning',
  COMMUNICATION: 'Communication',
  MESSAGING: 'Messagerie',
  ACCOUNTING: 'Comptabilité',
  SUBSIDIES: 'Subventions',
  SPONSORING: 'Sponsoring',
  WEBSITE: 'Site vitrine',
  BLOG: 'Blog',
  SHOP: 'Boutique',
  CLUB_LIFE: 'Vie du club',
  EVENTS: 'Événements',
  BOOKING: 'Réservations',
  PROJECTS: 'Projets',
  DOCUMENTS: 'Documents à signer',
};
