import { useQuery } from '@apollo/client/react';
import { MY_ADMIN_CLUBS } from './documents';
import type { MyAdminClubsQueryData, MyAdminClub } from './types';
import { getClubId, isLoggedIn } from './storage';

/**
 * Hook : retourne le club ACTIF (celui dont l'id est dans localStorage)
 * parmi la liste myAdminClubs. Cache la query Apollo, donc partagé avec
 * ClubSwitcher / SelectClubPage (1 seul fetch).
 *
 * Renvoie aussi `vitrinePublicUrl` calculé côté API (https://<customDomain>
 * ou fallback subdomain) pour les boutons "Ouvrir le site public".
 */
export function useCurrentClub(): {
  club: MyAdminClub | null;
  loading: boolean;
} {
  const { data, loading } = useQuery<MyAdminClubsQueryData>(MY_ADMIN_CLUBS, {
    skip: !isLoggedIn(),
    fetchPolicy: 'cache-first',
  });
  const currentId = getClubId();
  const clubs = data?.myAdminClubs ?? [];
  const club = clubs.find((c) => c.id === currentId) ?? null;
  return { club, loading };
}
