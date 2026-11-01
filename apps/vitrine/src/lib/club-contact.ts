import 'server-only';
import { fetchVitrinePage } from './vitrine-page';

/**
 * Coordonnées du club déduites de sa page Contact.
 *
 * Le pied de page et la barre d'actions mobile en ont besoin, mais la
 * plupart des clubs n'ont pas rempli le pied de page dans l'admin, alors
 * que la page Contact (bloc `sksrContact`) contient déjà adresse,
 * téléphone, e-mail, horaires et réseaux. Plutôt qu'une deuxième saisie,
 * on relit ce bloc. La page est déjà en cache (même requête que sa route).
 */
export interface ClubContact {
  address: string;
  phone: string;
  /** Lien `tel:` prêt à l'emploi, vide si aucun numéro. */
  phoneHref: string;
  email: string;
  hours: string;
  socialLinks: Array<{ href: string; label: string }>;
}

interface ContactItem {
  key?: string;
  value?: string;
  sub?: string;
  href?: string;
}

const EMPTY: ClubContact = {
  address: '',
  phone: '',
  phoneHref: '',
  email: '',
  hours: '',
  socialLinks: [],
};

const SVG = (path: string) =>
  `<svg viewBox="0 0 24 24" width="16" height="16" style="fill:none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${path}</svg>`;

const SOCIAL_ICONS: Record<string, string> = {
  Facebook: SVG(
    '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/>',
  ),
  Instagram: SVG(
    '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>',
  ),
};

function socialLabel(href: string): string {
  if (/facebook\./i.test(href)) return 'Facebook';
  if (/instagram\./i.test(href)) return 'Instagram';
  if (/youtube\./i.test(href)) return 'YouTube';
  if (/tiktok\./i.test(href)) return 'TikTok';
  return 'Réseau social';
}

export function socialIcon(label: string): string {
  return SOCIAL_ICONS[label] ?? '';
}

export function contactFromItems(items: ContactItem[]): ClubContact {
  const out: ClubContact = { ...EMPTY, socialLinks: [] };
  for (const it of items) {
    const key = it.key ?? '';
    const href = it.href ?? '';
    if (href.startsWith('tel:')) {
      out.phone = it.value ?? '';
      out.phoneHref = href;
    } else if (href.startsWith('mailto:')) {
      out.email = it.value ?? href.slice('mailto:'.length);
    } else if (/^https?:\/\//.test(href)) {
      out.socialLinks.push({ href, label: socialLabel(href) });
    } else if (/adresse/i.test(key)) {
      out.address = [it.value, it.sub].filter(Boolean).join('\n');
    } else if (/horaire/i.test(key)) {
      out.hours = it.value ?? '';
    }
  }
  return out;
}

export async function fetchClubContact(clubSlug: string): Promise<ClubContact> {
  const page = await fetchVitrinePage(clubSlug, 'contact');
  const block = page?.sections.find((s) => s.type === 'sksrContact');
  const items = (block?.props as { items?: ContactItem[] } | undefined)?.items;
  return Array.isArray(items) ? contactFromItems(items) : EMPTY;
}
