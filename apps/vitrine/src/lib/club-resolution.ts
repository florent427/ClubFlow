import 'server-only';
import { headers } from 'next/headers';
import { fetchGraphQL } from './graphql-client';

/**
 * Résolution du club servi par la vitrine depuis le hostname.
 *
 * Priorité (Phase 2+) :
 * 1. **Subdomain wildcard** : si host = `<slug>.<VITRINE_PUBLIC_BASE_DOMAIN>`
 *    → lookup `publicClub(slug)`. Permet le signup self-service avec
 *    fallback URL `<slug>.clubflow.topdigital.re` (cf. createClubAndAdmin).
 * 2. **Custom domain** : si host est un FQDN externe (ex: sksr.re,
 *    monclub.fr) → lookup `publicClubByDomain(domain)`.
 * 3. **Env legacy** : `VITRINE_DEFAULT_CLUB_SLUG` (mono-club, MVP Phase 1).
 *
 * Le middleware vitrine (`middleware.ts`) injecte le header `x-vitrine-host`
 * à chaque requête pour que les RSC puissent lire le hostname côté serveur.
 */

export interface ClubInfo {
  id: string;
  slug: string;
  name: string;
}

interface PublicClubBySlugQueryData {
  publicClub: ClubInfo;
}

interface PublicClubByDomainQueryData {
  publicClubByDomain: ClubInfo | null;
}

const PUBLIC_CLUB_BY_SLUG_QUERY = /* GraphQL */ `
  query PublicClubForVitrineBySlug($slug: String!) {
    publicClub(slug: $slug) {
      id
      slug
      name
    }
  }
`;

const PUBLIC_CLUB_BY_DOMAIN_QUERY = /* GraphQL */ `
  query PublicClubForVitrineByDomain($domain: String!) {
    publicClubByDomain(domain: $domain) {
      id
      slug
      name
    }
  }
`;

/**
 * Extrait le slug d'un hostname si c'est un subdomain de la base ClubFlow.
 *
 * Exemples (avec VITRINE_PUBLIC_BASE_DOMAIN=clubflow.topdigital.re) :
 *  - "test-club.clubflow.topdigital.re" → "test-club"
 *  - "sksr.re" → null (custom domain, pas un subdomain)
 *  - "localhost:5175" → null
 *
 * Refuse les sous-sous-domains (a.b.clubflow.topdigital.re → null).
 */
function slugFromSubdomain(host: string | null): string | null {
  if (!host) return null;
  const cleaned = (host.split(':')[0] ?? host).toLowerCase();
  const base = (
    process.env.VITRINE_PUBLIC_BASE_DOMAIN ?? 'clubflow.topdigital.re'
  ).toLowerCase();
  if (cleaned === base) return null;
  if (cleaned.endsWith('.' + base)) {
    const slug = cleaned.slice(0, cleaned.length - base.length - 1);
    if (slug.includes('.')) return null;
    return slug || null;
  }
  // Legacy clubflow.fr (ancien naming, gardé pour compat)
  if (cleaned.endsWith('.clubflow.fr')) {
    const part = cleaned.split('.')[0];
    return part && !part.includes('.') ? part : null;
  }
  return null;
}

/**
 * True si le host est un domaine custom (pas un subdomain de la base ClubFlow,
 * pas localhost). Déclenche le lookup `publicClubByDomain` côté API.
 */
function isCustomDomain(host: string | null): boolean {
  if (!host) return false;
  const cleaned = (host.split(':')[0] ?? host).toLowerCase();
  if (
    cleaned === 'localhost' ||
    cleaned.startsWith('127.') ||
    cleaned.includes('::')
  ) {
    return false;
  }
  const base = (
    process.env.VITRINE_PUBLIC_BASE_DOMAIN ?? 'clubflow.topdigital.re'
  ).toLowerCase();
  if (cleaned === base || cleaned.endsWith('.' + base)) return false;
  if (cleaned.endsWith('.clubflow.fr')) return false;
  return cleaned.includes('.');
}

export async function resolveCurrentClub(): Promise<ClubInfo> {
  const hdrs = await headers();
  const host = hdrs.get('x-vitrine-host') ?? hdrs.get('host');

  // 1. Subdomain wildcard <slug>.clubflow.topdigital.re
  const subdomainSlug = slugFromSubdomain(host);
  if (subdomainSlug) {
    try {
      const data = await fetchGraphQL<PublicClubBySlugQueryData>(
        PUBLIC_CLUB_BY_SLUG_QUERY,
        { slug: subdomainSlug },
        { revalidate: 300 },
      );
      if (data.publicClub) return data.publicClub;
    } catch {
      // Si le slug n'existe pas en DB, on tombe sur le fallback env (legacy)
    }
  }

  // 2. Custom domain (sksr.re, monclub.fr, etc.)
  if (isCustomDomain(host)) {
    try {
      const cleaned = (host?.split(':')[0] ?? host ?? '').toLowerCase();
      const data = await fetchGraphQL<PublicClubByDomainQueryData>(
        PUBLIC_CLUB_BY_DOMAIN_QUERY,
        { domain: cleaned },
        { revalidate: 300 },
      );
      if (data.publicClubByDomain) return data.publicClubByDomain;
    } catch {
      // Continue vers le fallback
    }
  }

  // 3. Fallback env legacy (Phase 1 mono-club)
  const envSlug = process.env.VITRINE_DEFAULT_CLUB_SLUG;
  if (envSlug && envSlug.trim()) {
    const data = await fetchGraphQL<PublicClubBySlugQueryData>(
      PUBLIC_CLUB_BY_SLUG_QUERY,
      { slug: envSlug.trim() },
      { revalidate: 300 },
    );
    return data.publicClub;
  }

  throw new Error(
    `Impossible de résoudre le club pour host="${host}". ` +
      `Vérifier subdomain wildcard, customDomain en DB, ou VITRINE_DEFAULT_CLUB_SLUG.`,
  );
}
