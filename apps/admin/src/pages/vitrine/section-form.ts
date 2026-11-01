/**
 * Logique pure de l'éditeur de sections de la vitrine : libellés lisibles,
 * nature de chaque champ, gabarit d'un nouvel élément de liste et
 * opérations sur les listes. Le formulaire (`SectionPropsForm`) est généré à partir de
 * la forme des `props` d'une section : aucun schéma par type de bloc à
 * maintenir, un nouveau bloc devient éditable sans toucher l'admin.
 */

const BLOCK_LABELS: Record<string, string> = {
  pageHero: 'En-tête de page',
  sksrHero: "Bandeau d'accueil",
  sksrManifesto: 'Manifeste',
  sksrVoie: 'Dōjō-kun (préceptes)',
  sksrCoursPreview: 'Aperçu des cours',
  sksrDojoSplit: 'Le dojo',
  sksrActuPreview: 'Dernières actualités',
  sksrCtaBand: "Bandeau d'appel à l'action",
  sksrTimeline: 'Chronologie',
  sksrTwoCol: 'Deux colonnes',
  sksrStatsBand: 'Chiffres clés',
  sksrValues: 'Valeurs',
  sksrPlanning: 'Planning',
  sksrDisciplines: 'Disciplines',
  sksrDojoIntro: 'Présentation du dojo',
  sksrSpec: 'Caractéristiques',
  sksrEquipment: 'Équipement',
  sksrEtiquette: 'Étiquette du dojo',
  sksrTarifs: 'Tarifs',
  sksrInfoBand: "Bandeau d'information",
  sksrInscription: 'Inscription',
  sksrSensei: 'Sensei',
  sksrTeachers: 'Enseignants',
  sksrLineage: 'Lignée',
  sksrGallery: 'Galerie',
  sksrNews: 'Actualités',
  sksrCalendar: 'Calendrier',
  sksrPalmares: 'Palmarès',
  sksrResults: 'Résultats',
  sksrChampsBand: 'Champions',
  sksrContact: 'Contact',
  sksrMap: 'Carte',
};

const FIELD_LABELS: Record<string, string> = {
  addr: 'Adresse',
  age: 'Âge',
  ageRange: "Tranche d'âge",
  ageUnit: "Unité d'âge",
  articles: 'Articles',
  bio: 'Biographie',
  bioParagraphs: 'Biographie (paragraphes)',
  bronze: 'Bronze',
  cards: 'Cartes',
  cat: 'Catégorie',
  count: 'Nombre',
  ctaHref: 'Lien du bouton',
  ctaLabel: 'Texte du bouton',
  ctaPrimary: 'Bouton principal',
  ctaSecondary: 'Bouton secondaire',
  date: 'Date',
  dates: 'Dates',
  day: 'Jour',
  desc: 'Description',
  event: 'Événement',
  events: 'Événements',
  excerpt: 'Extrait',
  featured: 'À la une',
  features: 'Points forts',
  filters: 'Filtres',
  formSub: 'Sous-titre du formulaire',
  formTitle: 'Titre du formulaire',
  gold: 'Or',
  hourIdx: 'Créneau horaire',
  href: 'Lien',
  icon: 'Icône',
  imageUrl: 'Image',
  intro: 'Introduction',
  items: 'Éléments',
  kanji: 'Kanji',
  kanjiBg: 'Kanji de fond',
  kanjiSub: 'Sous-titre du kanji',
  key: 'Intitulé',
  label: 'Libellé',
  lead: 'Chapeau',
  level: 'Niveau',
  links: 'Liens',
  logoUrl: 'Logo',
  mapEmbedUrl: "Carte (adresse d'intégration)",
  meta: 'Détail',
  metaItems: 'Infos clés',
  month: 'Mois',
  name: 'Nom',
  nameFirst: 'Prénom',
  nameJp: 'Nom japonais',
  nameLast: 'Nom de famille',
  note: 'Note',
  num: 'Numéro',
  paragraphs: 'Paragraphes',
  photos: 'Photos',
  place: 'Lieu',
  priceAnnual: 'Prix annuel',
  priceMonthly: 'Prix mensuel',
  primary: 'Principal',
  quote: 'Citation',
  quoteAuthor: 'Auteur de la citation',
  rank: 'Rang',
  rankLabel: 'Grade',
  role: 'Rôle',
  rows: 'Lignes',
  rules: 'Règles',
  secondary: 'Secondaire',
  seeAllHref: 'Lien « tout voir »',
  seeAllLabel: 'Texte « tout voir »',
  signature: 'Signature',
  silver: 'Argent',
  size: 'Taille',
  slots: 'Créneaux',
  span: 'Durée (en créneaux)',
  stamp: 'Tampon',
  steps: 'Étapes',
  sub: 'Complément',
  subtitle: 'Sous-titre',
  tag: 'Étiquette',
  teachers: 'Enseignants',
  text: 'Texte',
  title: 'Titre',
  titleEm: 'Titre, partie en italique',
  titleEm1: 'Titre, partie en italique',
  titleLineA: 'Titre, ligne 1',
  titleLineAEm: 'Titre, ligne 1 en italique',
  titleLineB: 'Titre, ligne 2',
  titleLineBEm: 'Titre, ligne 2 en italique',
  titleLines: 'Lignes du titre',
  titleTop: 'Titre, ligne du haut',
  groupLabel: 'Libellé du groupe',
  groupTitle: 'Titre du groupe',
  groupTitleEm: 'Titre du groupe, partie en italique',
  groupLead: 'Chapeau du groupe',
  lbl: 'Libellé',
  nameSub: 'Complément du nom',
  valueUnit: 'Unité',
  type: 'Type',
  url: 'Adresse (URL)',
  val: 'Valeur',
  value: 'Valeur',
  year: 'Année',
};

/**
 * Ordre de lecture d'une section, de haut en bas comme sur le site. Les
 * champs absents de la liste suivent dans l'ordre du JSON ; groupes et
 * listes viennent toujours en dernier.
 */
const FIELD_ORDER = [
  'label',
  'tag',
  'stamp',
  'kanji',
  'kanjiBg',
  'title',
  'titleEm',
  'subtitle',
  'lead',
  'intro',
  'text',
  'desc',
  'quote',
  'quoteAuthor',
  'imageUrl',
  'logoUrl',
  'ctaLabel',
  'ctaHref',
  'seeAllLabel',
  'seeAllHref',
];

/** Champs conservés tels quels mais jamais montrés (identifiants internes). */
const HIDDEN_FIELDS = new Set(['id']);

const LONG_TEXT_KEY = /^(desc|description|text|intro|lead|bio|excerpt|quote|body|content|paragraph|note)/i;
const MEDIA_KEY = /(image|logo|photo|cover|avatar|background)(url|src)?$/i;
const MEDIA_LIST_KEY = /(photo|image|gallery|galerie)/i;

/** « sksrCoursPreview » → nom affiché ; repli lisible pour un bloc inconnu. */
export function blockLabel(type: string): string {
  return BLOCK_LABELS[type] ?? humanize(type.replace(/^sksr/, ''));
}

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? humanize(key);
}

export function isHiddenField(key: string): boolean {
  return HIDDEN_FIELDS.has(key);
}

/** Entrées visibles d'un objet, dans l'ordre de lecture (cf. `FIELD_ORDER`). */
export function orderedEntries(
  value: Record<string, unknown>,
): Array<[string, unknown]> {
  const rank = (key: string, v: unknown): number => {
    if (v !== null && typeof v === 'object') return FIELD_ORDER.length + 1;
    const i = FIELD_ORDER.indexOf(key);
    return i === -1 ? FIELD_ORDER.length : i;
  };
  return Object.entries(value)
    .filter(([k]) => !isHiddenField(k))
    .map((entry, i) => ({ entry, i, r: rank(entry[0], entry[1]) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.entry);
}

/**
 * Champ image : `imageUrl`, `logoUrl`, `photo`… ou un `url` rangé dans une
 * liste de photos (`photos[i].url`). `mapEmbedUrl` et les liens restent du
 * texte.
 */
export function isMediaField(key: string, parentKey?: string): boolean {
  if (MEDIA_KEY.test(key)) return true;
  return key === 'url' && parentKey !== undefined && MEDIA_LIST_KEY.test(parentKey);
}

export function isLongText(key: string, value: string): boolean {
  return LONG_TEXT_KEY.test(key) || value.length > 90 || value.includes('\n');
}

/** Nom court d'un élément de liste, pour son en-tête replié. */
export function itemSummary(item: unknown, index: number): string {
  const fallback = `Élément ${index + 1}`;
  if (typeof item === 'string') return item.trim() || fallback;
  if (!item || typeof item !== 'object' || Array.isArray(item)) return fallback;
  const obj = item as Record<string, unknown>;
  for (const key of ['title', 'name', 'label', 'key', 'event', 'text', 'day']) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && v.trim() && !/^https?:|^\//.test(v)) {
      return v.trim();
    }
  }
  return fallback;
}

/**
 * Gabarit vide calqué sur un élément existant : mêmes clés, valeurs remises
 * à zéro, listes vidées. Sert au bouton « Ajouter » d'une liste.
 */
export function emptyLike(value: unknown): unknown {
  if (typeof value === 'string') return '';
  if (typeof value === 'number') return 0;
  if (typeof value === 'boolean') return false;
  if (Array.isArray(value)) return [];
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = emptyLike(v);
    return out;
  }
  return '';
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list.slice();
  const copy = list.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}

export function removeItem<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

function humanize(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words[0]!.toUpperCase() + words.slice(1) : key;
}
