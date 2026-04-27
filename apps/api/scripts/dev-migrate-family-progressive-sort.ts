/**
 * Migration ponctuelle : passe les règles FAMILY_PROGRESSIVE existantes
 * de `sortBy: AMOUNT_DESC` (default historique) vers
 * `sortBy: ENROLLMENT_ORDER` (default actuel, plus intuitif pour les
 * associations).
 *
 * Si tu veux garder le tri par montant décroissant, NE PAS exécuter ce
 * script — passe par l'admin Settings → Adhésion pour modifier la règle
 * manuellement.
 *
 * Usage :
 *   cd apps/api
 *   NODE_ENV=development npx ts-node \
 *     --compiler-options "{\"module\":\"CommonJS\"}" \
 *     scripts/dev-migrate-family-progressive-sort.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refus en production.');
  }
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(
      `DATABASE_URL ne pointe pas vers localhost (${url}). Refus.`,
    );
  }

  const rules = await prisma.membershipPricingRule.findMany({
    where: { pattern: 'FAMILY_PROGRESSIVE' },
    select: { id: true, label: true, configJson: true, clubId: true },
  });

  console.log(`🔍 ${rules.length} règles FAMILY_PROGRESSIVE détectées`);
  let updated = 0;
  for (const r of rules) {
    const cfg =
      typeof r.configJson === 'string'
        ? JSON.parse(r.configJson)
        : (r.configJson as Record<string, unknown>);
    const currentSort = cfg.sortBy ?? 'AMOUNT_DESC';
    if (currentSort === 'ENROLLMENT_ORDER') {
      console.log(`  ⏭  ${r.label} (déjà ENROLLMENT_ORDER) — skip`);
      continue;
    }
    const nextCfg = { ...cfg, sortBy: 'ENROLLMENT_ORDER' };
    await prisma.membershipPricingRule.update({
      where: { id: r.id },
      data: { configJson: nextCfg },
    });
    console.log(
      `  ✅ ${r.label} : ${currentSort} → ENROLLMENT_ORDER (club=${r.clubId.slice(0, 8)})`,
    );
    updated++;
  }
  console.log(`\n${updated} règle(s) migrée(s).`);
}

main()
  .catch((e) => {
    console.error('❌ Migration failed :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
