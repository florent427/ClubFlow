/**
 * Backfill ADR-0012 — donner une variante par défaut à chaque produit qui n'en
 * a pas encore.
 *
 * Le stock quitte `ShopProduct.stock` pour `ShopProductVariant.available`.
 * Tant qu'un produit n'a pas sa variante, il n'est plus vendable : ce script
 * doit tourner juste après le déploiement du lot 0.
 *
 * IDEMPOTENT — la garde `variants: { none: {} }` est dans la REQUÊTE, pas dans
 * un `if` : deux exécutions concurrentes ne peuvent pas créer deux variantes
 * par défaut, le @@unique([productId, optionSignature]) refusant la seconde.
 * Rejouable sans risque.
 *
 * Usage :
 *   cd apps/api && npx ts-node ../../bin/backfill-shop-variants.ts [--dry-run]
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  const orphans = await prisma.shopProduct.findMany({
    where: { variants: { none: {} } },
    select: { id: true, clubId: true, sku: true, name: true, stock: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(
    `${orphans.length} produit(s) sans variante${dryRun ? ' — simulation' : ''}.`,
  );
  if (orphans.length === 0) return;

  let created = 0;
  let skipped = 0;

  for (const p of orphans) {
    // `stock: null` signifiait « illimité » dans l'ancien modèle. La sémantique
    // est reportée sur le booléen dédié, pas sur un compteur nullable : le
    // prédicat `available >= qty` doit rester total (ADR-0012 §2).
    const trackStock = p.stock !== null;
    const quantity = p.stock ?? 0;

    if (dryRun) {
      console.log(
        `  [dry] ${p.name} — trackStock=${trackStock} onHand=available=${quantity}`,
      );
      created++;
      continue;
    }

    try {
      await prisma.shopProductVariant.create({
        data: {
          clubId: p.clubId,
          productId: p.id,
          // Chaîne VIDE et non null : c'est elle qui porte l'unicité.
          optionSignature: '',
          isDefault: true,
          label: null,
          sku: p.sku,
          // Null = hérite du prix du produit. Le produit reste la source.
          priceCents: null,
          trackStock,
          onHand: quantity,
          available: quantity,
        },
      });
      created++;
    } catch (err) {
      // P2002 : une exécution concurrente a gagné la course. C'est le
      // comportement voulu, pas une erreur.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        skipped++;
        continue;
      }
      throw err;
    }
  }

  console.log(`✅ ${created} variante(s) créée(s), ${skipped} déjà présente(s).`);
}

main()
  .catch((err) => {
    console.error('❌ backfill interrompu :', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
