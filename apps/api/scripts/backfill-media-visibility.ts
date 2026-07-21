/**
 * Rattrapage de `MediaAsset.visibility` — correctif d'accès aux médias.
 *
 * La colonne naît à `PRIVATE` pour tout le monde. Ce script rend PUBLIC ce
 * qui doit l'être, en balayant les colonnes qui stockent une URL de média
 * EN TEXTE, invisibles à toute relation Prisma.
 *
 * ⚠️ À LANCER JUSTE APRÈS LE DÉPLOIEMENT, avant que quiconque ouvre la
 * vitrine. Sans lui, le logo du club passe en 404 sur le site public, les
 * factures et les mails — vérifié : en production, `Club.logoUrl` du SKSR
 * pointe vers un média qu'AUCUNE clé étrangère ne référence.
 *
 * Les surfaces rattachées par clé étrangère (galerie, couvertures d'articles,
 * OG, projets) n'ont PAS besoin de ce script : le contrôle de lecture les voit
 * par la relation. On ne les touche pas — inutile de dupliquer une vérité qui
 * se calcule déjà.
 *
 * IDEMPOTENT et rejouable.
 *
 * Usage :
 *   cd apps/api && npx ts-node scripts/backfill-media-visibility.ts [--dry-run]
 *
 * DANS apps/api et non dans bin/ : il n'y a pas de workspaces npm (ADR-0004),
 * donc `node_modules` n'existe que dans chaque app. Un script placé à la
 * racine ne peut pas résoudre `@prisma/client`, quelles que soient les
 * options passées à ts-node — vérifié sur staging.
 */
import { PrismaClient, MediaVisibility } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

/**
 * Colonnes stockant une URL de média en clair, et qui désignent une surface
 * PUBLIQUE. Les colonnes privées — `Contact.photoUrl`, `Member.photoUrl`,
 * `ChatRoom.coverImageUrl` — sont volontairement absentes : elles doivent
 * rester derrière l'authentification.
 */
const SOURCES_PUBLIQUES: Array<{
  libelle: string;
  charger: () => Promise<Array<string | null>>;
}> = [
  {
    libelle: 'Club.logoUrl',
    charger: async () =>
      (await prisma.club.findMany({ select: { logoUrl: true } })).map(
        (r) => r.logoUrl,
      ),
  },
  {
    libelle: 'BlogPost.coverImageUrl',
    charger: async () =>
      (await prisma.blogPost.findMany({ select: { coverImageUrl: true } })).map(
        (r) => r.coverImageUrl,
      ),
  },
  {
    libelle: 'ShopProduct.imageUrl',
    charger: async () =>
      (await prisma.shopProduct.findMany({ select: { imageUrl: true } })).map(
        (r) => r.imageUrl,
      ),
  },
  {
    // `coverMediaAssetId` est déjà l'UUID de l'asset (pas une URL) — accepté
    // tel quel par `extraireId`. Manquait au rattrapage initial : les images
    // d'événement s'affichaient donc en 404 sur la vitrine publique.
    libelle: 'ClubEvent.coverMediaAssetId',
    charger: async () =>
      (
        await prisma.clubEvent.findMany({ select: { coverMediaAssetId: true } })
      ).map((r) => r.coverMediaAssetId),
  },
];

const UUID_RE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * Extrait l'UUID d'une URL `.../media/<uuid>`, OU accepte un UUID déjà nu.
 *
 * Les colonnes-URL (`logoUrl`…) portent l'id dans une URL ; mais
 * `ClubEvent.coverMediaAssetId` est déjà l'id lui-même. On accepte donc les
 * deux formes plutôt que de dupliquer la boucle.
 */
function extraireId(valeur: string | null): string | null {
  if (!valeur) return null;
  const dansUrl = valeur.match(new RegExp(`/media/(${UUID_RE})`, 'i'));
  if (dansUrl) return dansUrl[1];
  return new RegExp(`^${UUID_RE}$`, 'i').test(valeur) ? valeur : null;
}

async function main(): Promise<void> {
  const aPublier = new Set<string>();

  for (const src of SOURCES_PUBLIQUES) {
    const urls = await src.charger();
    const ids = urls.map(extraireId).filter((v): v is string => v !== null);
    ids.forEach((id) => aPublier.add(id));
    console.log(`  ${src.libelle} : ${ids.length} média(s) référencé(s)`);
  }

  if (aPublier.size === 0) {
    console.log('Aucun média à publier.');
    return;
  }

  // Ne compter que ceux qui changent réellement d'état : rejouer le script
  // ne doit pas laisser croire à un travail qui n'a pas eu lieu.
  const dejaPublics = await prisma.mediaAsset.count({
    where: { id: { in: [...aPublier] }, visibility: MediaVisibility.PUBLIC },
  });
  const aChanger = aPublier.size - dejaPublics;

  console.log(
    `\n${aPublier.size} média(s) désigné(s) par une surface publique — ` +
      `${aChanger} à basculer, ${dejaPublics} déjà public(s).`,
  );

  if (dryRun) {
    console.log('(simulation — rien n’a été écrit)');
    return;
  }

  const { count } = await prisma.mediaAsset.updateMany({
    where: { id: { in: [...aPublier] }, visibility: MediaVisibility.PRIVATE },
    data: { visibility: MediaVisibility.PUBLIC },
  });
  console.log(`✅ ${count} média(s) basculé(s) en PUBLIC.`);

  // Un identifiant présent dans une URL mais absent de la table signale une
  // URL morte : l'image est déjà cassée aujourd'hui, le correctif n'y est
  // pour rien, mais autant le dire.
  const trouves = await prisma.mediaAsset.count({
    where: { id: { in: [...aPublier] } },
  });
  if (trouves < aPublier.size) {
    console.warn(
      `⚠️  ${aPublier.size - trouves} URL(s) pointent vers un média absent ` +
        `de la base — image déjà cassée, indépendamment de ce correctif.`,
    );
  }
}

main()
  .catch((err) => {
    console.error('❌ rattrapage interrompu :', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
