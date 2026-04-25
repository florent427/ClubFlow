import type {
  MembershipCart,
  MembershipCartItem,
  MembershipCartPendingItem,
  Member,
  MembershipProduct,
  Contact,
  ClubSeason,
  Invoice,
} from '@prisma/client';
import type {
  MembershipCartGraph,
  MembershipCartItemGraph,
  MembershipCartPendingItemGraph,
} from './models/membership-cart.model';
import type { CartPreview } from './membership-cart.service';

type CartWithRelations = MembershipCart & {
  items: Array<
    MembershipCartItem & {
      member: Member;
      product: MembershipProduct | null;
    }
  >;
  pendingItems?: MembershipCartPendingItem[];
  payerContact: Contact | null;
  payerMember: Member | null;
  clubSeason: ClubSeason;
  invoice?: Invoice | null;
};

function payerFullName(cart: CartWithRelations): string | null {
  if (cart.payerMember) {
    const m = cart.payerMember;
    return `${m.firstName} ${m.lastName}`.trim();
  }
  if (cart.payerContact) {
    const c = cart.payerContact;
    return `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || null;
  }
  return null;
}

export function toMembershipCartGraph(
  cart: CartWithRelations,
  preview: CartPreview,
  productsById?: Map<string, { label: string; annualAmountCents: number }>,
): MembershipCartGraph {
  const previewByItem = new Map(preview.items.map((p) => [p.itemId, p]));
  const items: MembershipCartItemGraph[] = cart.items.map((item) => {
    const p = previewByItem.get(item.id);
    return {
      id: item.id,
      cartId: item.cartId,
      memberId: item.memberId,
      memberFullName: `${item.member.firstName} ${item.member.lastName}`,
      membershipProductId: item.membershipProductId,
      membershipProductLabel: item.product?.label ?? null,
      billingRhythm: item.billingRhythm,
      hasExistingLicense: item.hasExistingLicense,
      existingLicenseNumber: item.existingLicenseNumber,
      exceptionalDiscountCents: item.exceptionalDiscountCents,
      exceptionalDiscountReason: item.exceptionalDiscountReason,
      requiresManualAssignment: item.requiresManualAssignment,
      lineTotalCents: p?.lineTotalCents ?? 0,
      subscriptionBaseCents: p?.subscriptionBaseCents ?? 0,
      subscriptionAdjustedCents: p?.subscriptionAdjustedCents ?? 0,
      oneTimeFeesCents: p?.oneTimeFeesCents ?? 0,
      pricingRulePreviews: p?.pricingRulePreviews ?? [],
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  });

  // Mappe les pending items, en résolvant les labels produit + total
  // estimé à partir du `productsById` fourni (ou retombe sur des labels
  // génériques si pas de map).
  const pendingItems: MembershipCartPendingItemGraph[] = (
    cart.pendingItems ?? []
  )
    .filter((p) => p.convertedToMemberId === null)
    .map((p) => {
      const labels: string[] = [];
      let estimatedTotal = 0;
      for (const productId of p.membershipProductIds) {
        const product = productsById?.get(productId);
        labels.push(product?.label ?? `Formule ${productId.slice(0, 6)}…`);
        estimatedTotal += product?.annualAmountCents ?? 0;
      }
      return {
        id: p.id,
        cartId: p.cartId,
        firstName: p.firstName,
        lastName: p.lastName,
        civility: p.civility,
        birthDate: p.birthDate,
        email: p.email,
        membershipProductIds: p.membershipProductIds,
        membershipProductLabels: labels,
        estimatedTotalCents: estimatedTotal,
        billingRhythm: p.billingRhythm,
        createdAt: p.createdAt,
      };
    });

  return {
    id: cart.id,
    clubId: cart.clubId,
    familyId: cart.familyId,
    clubSeasonId: cart.clubSeasonId,
    clubSeasonLabel: cart.clubSeason.label,
    payerContactId: cart.payerContactId,
    payerMemberId: cart.payerMemberId,
    payerFullName: payerFullName(cart),
    status: cart.status,
    validatedAt: cart.validatedAt,
    invoiceId: cart.invoiceId,
    cancelledReason: cart.cancelledReason,
    notes: cart.notes,
    items,
    pendingItems,
    totalCents: preview.totalCents,
    requiresManualAssignmentCount: preview.requiresManualAssignmentCount,
    canValidate: preview.canValidate,
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
  };
}
