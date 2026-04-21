/*
 * Seed d'assets pour le site vitrine du club démo.
 *
 * Copie les images SKSR (logo, dojo, senseis) depuis leur dossier source
 * vers `uploads/clubs/<clubId>/media/` et crée les rows `MediaAsset`
 * correspondantes.
 *
 * Usage :
 *   DATABASE_URL=... SKSR_ASSETS_DIR=C:/Users/flore/Downloads/site_sksr_or/assets \
 *     npx tsx prisma/seed-vitrine-assets.ts [clubSlug]
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { copyFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { basename, extname, join, resolve } from 'path';

const prisma = new PrismaClient();

interface AssetSpec {
  filename: string;
  /** Clé logique utilisée ensuite pour patcher les sections. */
  tag: string;
  ownerKind?: string;
}

const ASSETS: AssetSpec[] = [
  { filename: 'logo-sksr.svg', tag: 'logo' },
  { filename: 'logo-sksr.png', tag: 'logo-png' },
  { filename: 'dojo.jpg', tag: 'dojo-hero' },
  { filename: 'florent_sensei.png', tag: 'sensei-florent' },
  { filename: 'damien_sensei.png', tag: 'sensei-damien' },
];

function uploadsRoot(): string {
  const env = process.env.UPLOADS_DIR?.trim();
  return resolve(env && env.length > 0 ? env : './uploads');
}

function assetsRoot(): string {
  const env = process.env.SKSR_ASSETS_DIR?.trim();
  if (!env) {
    throw new Error(
      'SKSR_ASSETS_DIR non défini (chemin vers site_sksr_or/assets)',
    );
  }
  return resolve(env);
}

function mimeFor(filename: string): string {
  const ext = extname(filename).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

async function main() {
  const slug =
    process.argv[2] ?? process.env.VITRINE_SEED_CLUB_SLUG ?? 'demo-club';
  const club = await prisma.club.findUnique({ where: { slug } });
  if (!club) {
    console.error(`Club introuvable pour slug "${slug}"`);
    process.exit(1);
  }

  const sourceDir = assetsRoot();
  const targetDir = join(uploadsRoot(), 'clubs', club.id, 'media');
  if (!existsSync(sourceDir)) {
    console.error(`Dossier source introuvable : ${sourceDir}`);
    process.exit(1);
  }
  mkdirSync(targetDir, { recursive: true });

  console.log(`Import assets SKSR vers ${targetDir}`);

  const apiBase =
    process.env.API_PUBLIC_URL?.replace(/\/+$/, '') ??
    'http://localhost:3000';

  for (const asset of ASSETS) {
    const src = join(sourceDir, asset.filename);
    if (!existsSync(src)) {
      console.warn(`  · ${asset.filename} : absent de ${sourceDir}, skip`);
      continue;
    }
    const size = statSync(src).size;
    const mime = mimeFor(asset.filename);
    const id = randomUUID();
    const ext = extname(asset.filename).toLowerCase();
    const target = join(targetDir, `${id}${ext}`);
    copyFileSync(src, target);

    // Cherche s'il existe déjà un asset avec ce tag (ownerKind=SKSR_SEED)
    const existing = await prisma.mediaAsset.findFirst({
      where: {
        clubId: club.id,
        ownerKind: 'SKSR_SEED',
        ownerId: asset.tag,
      },
    });
    if (existing) {
      console.log(`  · ${asset.filename} : déjà seedé (tag=${asset.tag})`);
      continue;
    }

    await prisma.mediaAsset.create({
      data: {
        id,
        clubId: club.id,
        kind: 'IMAGE',
        ownerKind: 'SKSR_SEED',
        ownerId: asset.tag,
        fileName: basename(asset.filename),
        mimeType: mime,
        sizeBytes: size,
        storagePath: join('clubs', club.id, 'media', `${id}${ext}`),
        publicUrl: `${apiBase}/media/${id}`,
      },
    });
    console.log(
      `  · ${asset.filename} → MediaAsset ${id} (tag=${asset.tag})`,
    );
  }

  // Patch d'usage : set le logo du club + backgroundImage du hero index
  const logo = await prisma.mediaAsset.findFirst({
    where: { clubId: club.id, ownerKind: 'SKSR_SEED', ownerId: 'logo' },
  });
  const dojoHero = await prisma.mediaAsset.findFirst({
    where: { clubId: club.id, ownerKind: 'SKSR_SEED', ownerId: 'dojo-hero' },
  });

  if (logo) {
    await prisma.club.update({
      where: { id: club.id },
      data: { logoUrl: logo.publicUrl },
    });
    console.log(`  · Club.logoUrl mis à jour → ${logo.publicUrl}`);
  }

  if (dojoHero) {
    const indexPage = await prisma.vitrinePage.findUnique({
      where: { clubId_slug: { clubId: club.id, slug: 'index' } },
    });
    if (indexPage) {
      const sections = Array.isArray(indexPage.sectionsJson)
        ? (indexPage.sectionsJson as Array<{
            id: string;
            type: string;
            props: Record<string, unknown>;
          }>)
        : [];
      const heroIdx = sections.findIndex((s) => s.type === 'hero');
      if (heroIdx !== -1) {
        sections[heroIdx] = {
          ...sections[heroIdx]!,
          props: {
            ...sections[heroIdx]!.props,
            backgroundImageUrl: dojoHero.publicUrl,
          },
        };
        await prisma.vitrinePage.update({
          where: { id: indexPage.id },
          data: { sectionsJson: sections as unknown as object },
        });
        console.log(`  · Hero backgroundImage index → ${dojoHero.publicUrl}`);
      }
    }
  }

  console.log('\nTerminé.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
