/**
 * Charte appliquée aux e-mails d'un club.
 *
 * La source de vérité est celle du site vitrine (`Club.vitrinePaletteJson`,
 * `Club.logoUrl`, coordonnées) : on ne crée PAS un second endroit où définir
 * les couleurs, sinon les deux divergent et personne ne sait lequel fait foi.
 *
 * Le défaut est **neutre**, jamais celui d'un club existant : un club sans
 * palette configurée ne doit pas hériter de l'or et du rouge de SKSR
 * (même principe que `neutralFallbackBranding` côté vitrine).
 */

/** Sous-ensemble de `ClubPalette` (vitrine) réellement utilisé en e-mail. */
export type MailPalette = {
  /** Bandeau d'en-tête et pied de page. */
  ink: string;
  /** Fond de la page autour de la carte. */
  paper: string;
  /** Filets, liens, bouton d'action. */
  accent: string;
  /** Texte secondaire sous la carte. */
  muted: string;
};

/** Neutre : aucune référence à un club. Sert quand rien n'est configuré. */
export const NEUTRAL_MAIL_PALETTE: MailPalette = {
  ink: '#1f2430',
  paper: '#f4f5f7',
  accent: '#3d5a80',
  muted: '#6b7280',
};

export type ClubMailBranding = {
  clubName: string;
  /** URL absolue du logo, ou null : le pied retombe alors sur le nom. */
  logoUrl: string | null;
  palette: MailPalette;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  siret: string | null;
  legalMentions: string | null;
};

/** Ligne de club telle que lue en base (champs strictement nécessaires). */
export type ClubBrandingRow = {
  name: string;
  logoUrl: string | null;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  siret: string | null;
  legalMentions: string | null;
  vitrinePaletteJson: unknown;
};

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Ne garde d'une couleur que ce qui est un hex littéral. Tout le reste est
 * refusé : la valeur part telle quelle dans un attribut `style`, donc une
 * chaîne libre venue de la base y injecterait du CSS arbitraire.
 */
function hexOrNull(value: unknown): string | null {
  return typeof value === 'string' && HEX.test(value.trim())
    ? value.trim()
    : null;
}

/**
 * Un logo ne s'affiche en e-mail que s'il est joignable depuis n'importe
 * quelle boîte mail : une URL absolue en http(s). Un chemin relatif
 * (`/uploads/…`) casserait l'image sans prévenir, on l'écarte.
 */
function absoluteUrlOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function trimmedOrNull(value: string | null): string | null {
  const t = value?.trim();
  return t ? t : null;
}

/** Charte e-mail d'un club, chaque champ absent retombant sur le neutre. */
export function clubMailBranding(row: ClubBrandingRow): ClubMailBranding {
  const raw =
    row.vitrinePaletteJson && typeof row.vitrinePaletteJson === 'object'
      ? (row.vitrinePaletteJson as Record<string, unknown>)
      : {};

  return {
    clubName: row.name.trim() || 'Votre club',
    logoUrl: absoluteUrlOrNull(row.logoUrl),
    palette: {
      ink: hexOrNull(raw.ink) ?? NEUTRAL_MAIL_PALETTE.ink,
      paper: hexOrNull(raw.paper) ?? NEUTRAL_MAIL_PALETTE.paper,
      accent: hexOrNull(raw.accent) ?? NEUTRAL_MAIL_PALETTE.accent,
      muted: hexOrNull(raw.muted) ?? NEUTRAL_MAIL_PALETTE.muted,
    },
    address: trimmedOrNull(row.address),
    contactEmail: trimmedOrNull(row.contactEmail),
    contactPhone: trimmedOrNull(row.contactPhone),
    siret: trimmedOrNull(row.siret),
    legalMentions: trimmedOrNull(row.legalMentions),
  };
}

/** Charte servie quand le club est inconnu (e-mail AUTH sans club résolu). */
export function platformMailBranding(): ClubMailBranding {
  return {
    clubName: 'ClubFlow',
    logoUrl: null,
    palette: NEUTRAL_MAIL_PALETTE,
    address: null,
    contactEmail: null,
    contactPhone: null,
    siret: null,
    legalMentions: null,
  };
}
