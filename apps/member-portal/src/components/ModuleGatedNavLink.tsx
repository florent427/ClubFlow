import type { ReactNode } from 'react';
import { useQuery } from '@apollo/client/react';
import { NavLink, type NavLinkProps } from 'react-router-dom';
import { getClubId } from '../lib/storage';
import { VIEWER_CLUB_MODULES } from '../lib/viewer-documents';
import type { ViewerClubModulesData } from '../lib/viewer-types';

/** Codes de `ModuleCode` (API). Union fermée : une faute de frappe ne peut
 *  pas masquer une entrée pour toujours sans que la compilation le dise. */
export type MemberModuleCode =
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

type Props = Omit<NavLinkProps, 'to' | 'children'> & {
  to: string;
  /** Tous requis pour que l'entrée s'affiche. */
  modules: MemberModuleCode[];
  children: ReactNode;
};

/**
 * Entrée de navigation conditionnée aux modules activés du club.
 *
 * Différence assumée avec l'équivalent admin : ici l'entrée est **masquée**,
 * pas grisée. Un administrateur peut réactiver le module, donc lui montrer un
 * lien désactivé l'informe ; un adhérent ne le peut pas — l'entrée grisée ne
 * serait qu'une frustration.
 */
export function ModuleGatedNavLink({ modules, to, children, ...rest }: Props) {
  const clubId = getClubId();
  const { data } = useQuery<ViewerClubModulesData>(VIEWER_CLUB_MODULES, {
    skip: !clubId,
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
  });

  const rows = data?.clubModules;
  // Masquée tant que la réponse n'est pas arrivée : afficher d'abord puis
  // retirer ferait sauter la sidebar, et surtout proposerait un lien que
  // `ClubModuleEnabledGuard` refuse côté API. Après le premier chargement la
  // réponse vient du cache Apollo, donc l'attente est invisible.
  const allowed =
    rows !== undefined &&
    modules.every((code) =>
      rows.some((m) => m.moduleCode === code && m.enabled),
    );

  if (!allowed) return null;

  return (
    <NavLink {...rest} to={to}>
      {children}
    </NavLink>
  );
}
