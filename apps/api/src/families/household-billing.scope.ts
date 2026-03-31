import type { Prisma } from '@prisma/client';

export type ViewerHouseholdInvoiceScope =
  | {
      kind: 'householdGroup';
      householdGroupId: string;
      carrierFamilyId: string | null;
    }
  | { kind: 'legacyFamily'; familyId: string };

/**
 * Clause Prisma pour factures visibles dans un groupe foyer (factures au groupe + brouillon transitoire sur foyer porteur).
 */
export function buildInvoiceWhereForHouseholdGroup(
  scope: Extract<ViewerHouseholdInvoiceScope, { kind: 'householdGroup' }>,
): Prisma.InvoiceWhereInput {
  const parts: Prisma.InvoiceWhereInput[] = [
    { householdGroupId: scope.householdGroupId },
  ];
  if (scope.carrierFamilyId) {
    parts.push({
      familyId: scope.carrierFamilyId,
      householdGroupId: null,
    });
  }
  return { OR: parts };
}
