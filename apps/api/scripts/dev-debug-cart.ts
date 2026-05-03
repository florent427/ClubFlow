/**
 * Debug : inspecte l'état des factures + pricing-rules + cart preview
 * pour le panier OPEN courant. Sert à diagnostiquer pourquoi une remise
 * n'est pas appliquée.
 *
 * Usage :
 *   cd apps/api
 *   NODE_ENV=development npx ts-node \
 *     --compiler-options "{\"module\":\"CommonJS\"}" scripts/dev-debug-cart.ts
 */
import {
  PrismaClient,
  InvoiceStatus,
  InvoiceLineKind,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Premier club avec module ACCOUNTING ou MEMBERS
  const clubs = await prisma.club.findMany({
    select: { id: true, slug: true, name: true },
    take: 5,
  });
  console.log('🏛️  Clubs détectés :', clubs.map((c) => c.slug).join(', '));

  for (const club of clubs) {
    console.log(`\n=== Club : ${club.name} (${club.slug}) ===`);

    // Saison active
    const season = await prisma.clubSeason.findFirst({
      where: { clubId: club.id, isActive: true },
      select: { id: true, label: true },
    });
    if (!season) {
      console.log('  ⚠️  Pas de saison active.');
      continue;
    }
    console.log(`  📅 Saison active : ${season.label}`);

    // Factures de la saison
    const invoices = await prisma.invoice.findMany({
      where: { clubId: club.id, clubSeasonId: season.id },
      select: {
        id: true,
        familyId: true,
        status: true,
        baseAmountCents: true,
        amountCents: true,
        installmentsCount: true,
        lockedPaymentMethod: true,
        createdAt: true,
        lines: {
          select: {
            id: true,
            kind: true,
            memberId: true,
            membershipProductId: true,
            baseAmountCents: true,
            adjustments: {
              select: {
                type: true,
                amountCents: true,
                reason: true,
                metadataJson: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    console.log(`  💰 ${invoices.length} factures`);
    for (const inv of invoices) {
      const subTotal = inv.lines.reduce(
        (s, l) =>
          s + l.baseAmountCents + l.adjustments.reduce((s2, a) => s2 + a.amountCents, 0),
        0,
      );
      console.log(
        `    [${inv.status}] family=${(inv.familyId ?? '—').slice(0, 8)} | base=${(inv.baseAmountCents / 100).toFixed(2)}€ amount=${(inv.amountCents / 100).toFixed(2)}€ ↔ recompute=${(subTotal / 100).toFixed(2)}€ | method=${inv.lockedPaymentMethod ?? '—'} (${inv.installmentsCount}×)`,
      );
      // Subscription lines avec adjustments
      const subs = inv.lines.filter(
        (l) => l.kind === InvoiceLineKind.MEMBERSHIP_SUBSCRIPTION,
      );
      for (const l of subs) {
        const adjStr = l.adjustments
          .map((a) => `${a.type}:${(a.amountCents / 100).toFixed(2)}`)
          .join(', ');
        console.log(
          `      L:${l.id.slice(0, 8)} member=${l.memberId.slice(0, 8)} prod=${(l.membershipProductId ?? '—').slice(0, 8)} base=${(l.baseAmountCents / 100).toFixed(2)} adj=[${adjStr}]`,
        );
      }
    }

    // Carts OPEN
    const carts = await prisma.membershipCart.findMany({
      where: { clubId: club.id, clubSeasonId: season.id, status: 'OPEN' },
      include: {
        items: { include: { product: true, member: true } },
        pendingItems: true,
      },
    });
    if (carts.length > 0) {
      console.log(`  🛒 ${carts.length} cart(s) OPEN`);
      for (const c of carts) {
        console.log(
          `    cart ${c.id.slice(0, 8)} family=${c.familyId.slice(0, 8)} items=${c.items.length} pending=${c.pendingItems.length}`,
        );
      }
    }

    // Pricing rules actives
    const rules = await prisma.membershipPricingRule.findMany({
      where: { clubId: club.id, isActive: true },
      select: { id: true, label: true, pattern: true, configJson: true },
    });
    console.log(`  🎁 ${rules.length} règles actives`);
    for (const r of rules) {
      const cfg =
        typeof r.configJson === 'string'
          ? r.configJson
          : JSON.stringify(r.configJson);
      console.log(
        `    [${r.pattern}] ${r.label} | config=${cfg.slice(0, 200)}…`,
      );
    }

    // Family discount legacy (Club)
    const clubCfg = await prisma.club.findUniqueOrThrow({
      where: { id: club.id },
      select: {
        membershipFamilyDiscountFromNth: true,
        membershipFamilyAdjustmentType: true,
        membershipFamilyAdjustmentValue: true,
        membershipFullPriceFirstMonths: true,
      },
    });
    console.log(
      `  🏠 Family legacy : fromNth=${clubCfg.membershipFamilyDiscountFromNth ?? '—'} type=${clubCfg.membershipFamilyAdjustmentType} value=${clubCfg.membershipFamilyAdjustmentValue} | fullPriceFirstMonths=${clubCfg.membershipFullPriceFirstMonths}`,
    );
  }
}

main()
  .catch((e) => {
    console.error('❌ Debug failed :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
