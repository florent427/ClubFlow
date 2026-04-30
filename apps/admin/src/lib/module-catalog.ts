/** Aligné seed API + registre modules (libellés UI admin). */
export type ModuleCodeStr =
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

export type ModuleCatalogEntry = {
  code: ModuleCodeStr;
  label: string;
  required: boolean;
  description: string;
  dependsOn?: ModuleCodeStr[];
};

export const MODULE_CATALOG: ModuleCatalogEntry[] = [
  {
    code: 'MEMBERS',
    label: 'Membres',
    required: true,
    description:
      'Annuaire des adhérents, fiches, rôles, grades et champs personnalisés.',
  },
  {
    code: 'FAMILIES',
    label: 'Familles & payeurs',
    required: true,
    description:
      'Foyers, payeurs, rattachements enfants-parents et partage d’accès.',
    dependsOn: ['MEMBERS'],
  },
  {
    code: 'PAYMENT',
    label: 'Paiement',
    required: false,
    description:
      'Factures du club, encaissements et paiement en ligne (Stripe).',
    dependsOn: ['FAMILIES'],
  },
  {
    code: 'PLANNING',
    label: 'Planning',
    required: false,
    description: 'Calendrier des cours, créneaux récurrents et professeurs.',
  },
  {
    code: 'COMMUNICATION',
    label: 'Communication',
    required: false,
    description:
      'Campagnes e-mail, push et Telegram vers vos adhérents et groupes.',
  },
  {
    code: 'MESSAGING',
    label: 'Messagerie',
    required: false,
    description:
      'Salons internes, groupes, messages directs et chats de famille.',
  },
  {
    code: 'ACCOUNTING',
    label: 'Comptabilité',
    required: false,
    description: 'Écritures, catégories et export comptable du club.',
    dependsOn: ['PAYMENT'],
  },
  {
    code: 'SUBSIDIES',
    label: 'Subventions',
    required: false,
    description:
      'Suivi des dossiers de subvention (collectivités, fédération).',
  },
  {
    code: 'SPONSORING',
    label: 'Sponsoring',
    required: false,
    description: 'Gestion des partenariats et conventions sponsors.',
  },
  {
    code: 'WEBSITE',
    label: 'Site web',
    required: false,
    description: 'Site public vitrine (identité, horaires, actualités).',
  },
  {
    code: 'BLOG',
    label: 'Blog',
    required: false,
    description: 'Articles publiables par les administrateurs du club.',
  },
  {
    code: 'SHOP',
    label: 'Boutique',
    required: false,
    description: 'Catalogue produits (kimono, affiliations, goodies).',
  },
  {
    code: 'CLUB_LIFE',
    label: 'Vie du club',
    required: false,
    description: 'Annonces internes et sondages auprès des adhérents.',
  },
  {
    code: 'EVENTS',
    label: 'Événements',
    required: false,
    description:
      'Stages, compétitions, rassemblements avec inscriptions et liste d’attente.',
  },
  {
    code: 'BOOKING',
    label: 'Réservations',
    required: false,
    description: 'Créneaux réservables (ex. salle, matériel) pour adhérents.',
    dependsOn: ['PLANNING'],
  },
  {
    code: 'PROJECTS',
    label: 'Événements / Projets',
    required: false,
    description:
      'Projets longs (gala, stage, subvention) avec sections structurées, contributeurs, phase Live modérée et comptes-rendus IA.',
    dependsOn: ['MEMBERS'],
  },
  {
    code: 'DOCUMENTS',
    label: 'Documents à signer',
    required: false,
    description:
      'Signature électronique de PDF (règlement intérieur, droit à l’image, autorisation parentale) avec versionning et audit trail.',
    dependsOn: ['MEMBERS'],
  },
];
