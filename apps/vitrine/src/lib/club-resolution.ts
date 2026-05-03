import 'server-only';
import { headers } from 'next/headers';
import { fetchGraphQL } from './graphql-client';

/**
 * Résolution du club servi par la vitrine depuis le hostname.
 *
 * Priorité :
 * 1. Variable d'env VITRINE_DEFAULT_CLUB_SLUG (mono-club, défaut du MVP)
 * 2. Header x-vitrine-host injecté par middleware.ts → lookup Club.customDomain
 *    ou slug de sous-domaine <slug>.clubflow.fr
 *
 * Phase 1 : on privilégie (1). (2) sera utilisé dès qu'on active le multi-club.
 */

export interface ClubInfo {
  id: string;
  slug: string;
  name: string;
}

interface PublicClubQueryData {
  publicClub: ClubInfo;
}

const PUBLIC_CLUB_QUERY = /* GraphQL */ `
  query PublicClubForVitrine($slug: String!) {
    publicClub(slug: $slug) {
      id
      slug
      name
    }
  }
`;

function slugFromHost(host: string | null): string | null {
  if (!host) return null;
  // <slug>.clubflow.fr ou localhost:PORT
  const cleaned = host.split(':')[0] ?? host;
  if (cleaned.endsWith('.clubflow.fr')) {
    return cleaned.split('.')[0] ?? null;
  }
  return null;
}

export async function resolveCurrentClub(): Promise<ClubInfo> {
  const envSlug = process.env.VITRINE_DEFAULT_CLUB_SLUG;
  const hdrs = await headers();
  const host = hdrs.get('x-vitrine-host') ?? hdrs.get('host');
  const slug = envSlug && envSlug.trim() ? envSlug.trim() : slugFromHost(host);
  if (!slug) {
    throw new Error(
      'Impossible de résoudre le club : VITRINE_DEFAULT_CLUB_SLUG manquant et host inconnu.',
    );
  }
  const data = await fetchGraphQL<PublicClubQueryData>(
    PUBLIC_CLUB_QUERY,
    { slug },
    { revalidate: 300 },
  );
  return data.publicClub;
}
