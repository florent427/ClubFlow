/** Aligné seed API + registre modules (libellés UI admin). */
export type ModuleCodeStr =
  | 'MEMBERS'
  | 'FAMILIES'
  | 'PAYMENT'
  | 'PLANNING'
  | 'COMMUNICATION'
  | 'ACCOUNTING'
  | 'SUBSIDIES'
  | 'SPONSORING'
  | 'WEBSITE'
  | 'BLOG'
  | 'SHOP'
  | 'CLUB_LIFE'
  | 'EVENTS'
  | 'BOOKING';

export const MODULE_CATALOG: {
  code: ModuleCodeStr;
  label: string;
  required: boolean;
}[] = [
  { code: 'MEMBERS', label: 'Membres', required: true },
  {
    code: 'FAMILIES',
    label: 'Familles & payeurs',
    required: true,
  },
  { code: 'PAYMENT', label: 'Paiement', required: false },
  { code: 'PLANNING', label: 'Planning', required: false },
  { code: 'COMMUNICATION', label: 'Communication', required: false },
  { code: 'ACCOUNTING', label: 'Comptabilité', required: false },
  { code: 'SUBSIDIES', label: 'Subventions', required: false },
  { code: 'SPONSORING', label: 'Sponsoring', required: false },
  { code: 'WEBSITE', label: 'Site web', required: false },
  { code: 'BLOG', label: 'Blog', required: false },
  { code: 'SHOP', label: 'Boutique', required: false },
  { code: 'CLUB_LIFE', label: 'Vie du club', required: false },
  { code: 'EVENTS', label: 'Événements', required: false },
  { code: 'BOOKING', label: 'Réservations', required: false },
];
