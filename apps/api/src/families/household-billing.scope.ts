import type { Prisma } from '@prisma/client';

export type ViewerHouseholdInvoiceScope =
  | {
      kind: 'householdGroup';
      householdGroupId: string;
      carrierFamilyId: string | null;
      /**
       * Foyers dont les factures sont visibles pour ce visiteur. Suit le
       * modèle d'invitation unilatéral : par défaut un payeur ne voit que
       * les factures de sa propre résidence ; il voit celles d'une autre
       * résidence uniquement si cette dernière l'a invité (pour co-payer
       * ou observer).
       */
      visibleFamilyIds: ReadonlySet<string>;
    }
  | { kind: 'legacyFamily'; familyId: string };

/**
 * Clause Prisma pour factures visibles dans un groupe foyer étendu.
 *
 * Modèle unilatéral : seules les factures des résidences auxquelles le
 * visiteur appartient (ou a été invité) sont exposées. Les factures du
 * foyer porteur (historique, `householdGroupId=null`) ne sont exposées
 * que si le porteur fait partie des foyers visibles.
 */
export function buildInvoiceWhereForHouseholdGroup(
  scope: Extract<ViewerHouseholdInvoiceScope, { kind: 'householdGroup' }>,
): Prisma.InvoiceWhereInput {
  const visibleIds = [...scope.visibleFamilyIds];
  if (visibleIds.length === 0) {
    // Aucune résidence accessible → aucune facture. On renvoie une clause
    // sentinelle qui ne matche aucune ligne plutôt que de laisser la porte
    // ouverte à une requête sans filtre.
    return { id: { in: [] } };
  }
  const parts: Prisma.InvoiceWhereInput[] = [
    {
      householdGroupId: scope.householdGroupId,
      familyId: { in: visibleIds },
    },
  ];
  if (scope.carrierFamilyId && visibleIds.includes(scope.carrierFamilyId)) {
    parts.push({
      familyId: scope.carrierFamilyId,
      householdGroupId: null,
    });
  }
  return { OR: parts };
}
