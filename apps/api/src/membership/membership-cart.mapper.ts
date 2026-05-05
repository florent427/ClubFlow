import type {
  MembershipCart,
  MembershipCartItem,
  MembershipCartPendingItem,
  Member,
  MembershipProduct,
  MembershipOneTimeFee,
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
  clubOneTimeFees: MembershipOneTimeFee[] = [],
): MembershipCartGraph {
  const previewByItem = new Map(preview.items.map((p) => [p.itemId, p]));
  const previewByPending = new Map(
    (preview.pendingItems ?? []).map((p) => [p.pendingItemId, p]),
  );
  const items: MembershipCartItemGraph[] = cart.items.map((item) => {
    const p = previewByItem.get(item.id);
    // Parse l'override CSV des fees OPTIONAL sélectionnés. Vide = null
    // (signal "pas de surcharge, applique les autoApply normalement").
    const overrideIds =
      item.oneTimeFeeOverrideIdsCsv && item.oneTimeFeeOverrideIdsCsv.length > 0
        ? item.oneTimeFeeOverrideIdsCsv.split(',').filter(Boolean)
        : null;
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
      oneTimeFeeOverrideIds: overrideIds,
      pricingRulePreviews: p?.pricingRulePreviews ?? [],
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  });

  // Mappe les pending items. Le `definitiveTotalCents` vient du preview
  // (calcul identique à validateCart : prorata + family + pricing rules
  // appliqués). `productsById` ne sert plus qu'à résoudre les labels
  // affichés à côté du prix.
  const pendingItems: MembershipCartPendingItemGraph[] = (
    cart.pendingItems ?? []
  )
    .filter((p) => p.convertedToMemberId === null)
    .map((p) => {
      const labels: string[] = [];
      for (const productId of p.membershipProductIds) {
        const product = productsById?.get(productId);
        labels.push(product?.label ?? `Formule ${productId.slice(0, 6)}…`);
      }
      // Si le preview n'a pas pu calculer ce pending (cas dégradé : engine
      // en panne ou produit archivé), on retombe sur la somme brute des
      // tarifs annuels comme estimation de secours.
      const pp = previewByPending.get(p.id);
      const fallbackEstimate = p.membershipProductIds.reduce(
        (sum, id) => sum + (productsById?.get(id)?.annualAmountCents ?? 0),
        0,
      );
      // Détail par formule : on enrichit chaque entrée du preview avec
      // le label produit (résolu via productsById) pour un affichage
      // sans round-trip côté front.
      const perProduct = (pp?.perProduct ?? []).map((entry) => ({
        productId: entry.productId,
        productLabel:
          productsById?.get(entry.productId)?.label ??
          `Formule ${entry.productId.slice(0, 6)}…`,
        subscriptionBaseCents: entry.subscriptionBaseCents,
        subscriptionAdjustedCents: entry.subscriptionAdjustedCents,
        pricingRulesDeltaCents: entry.pricingRulesDeltaCents,
      }));
      const subscriptionAdjustedCents = perProduct.reduce(
        (s, e) => s + e.subscriptionAdjustedCents,
        0,
      );
      const pendingOverrideIds =
        p.oneTimeFeeOverrideIdsCsv && p.oneTimeFeeOverrideIdsCsv.length > 0
          ? p.oneTimeFeeOverrideIdsCsv.split(',').filter(Boolean)
          : null;
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
        estimatedTotalCents: pp?.definitiveTotalCents ?? fallbackEstimate,
        subscriptionAdjustedCents,
        oneTimeFeesCents: pp?.oneTimeFeesCents ?? 0,
        hasExistingLicense: p.hasExistingLicense,
        existingLicenseNumber: p.existingLicenseNumber,
        oneTimeFeeOverrideIds: pendingOverrideIds,
        perProduct,
        billingRhythm: p.billingRhythm,
        pricingRulePreviews: pp?.pricingRulePreviews ?? [],
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
    clubOneTimeFees,
    totalCents: preview.totalCents,
    // Si le panier est validé et qu'une facture est liée, on expose son
    // montant TTC réel — c'est ce qui sera vraiment payé. Null sinon
    // (cart OPEN ou cart CANCELLED sans facture).
    invoiceAmountCents: cart.invoice?.amountCents ?? null,
    requiresManualAssignmentCount: preview.requiresManualAssignmentCount,
    canValidate: preview.canValidate,
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
  };
}
