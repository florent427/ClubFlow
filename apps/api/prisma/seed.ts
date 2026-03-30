import { randomUUID } from 'crypto';
import {
  PrismaClient,
  MembershipRole,
  type Prisma,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ModuleCode } from '../src/domain/module-registry/module-codes';

const prisma = new PrismaClient();

const MODULE_LABELS: Record<ModuleCode, string> = {
  [ModuleCode.MEMBERS]: 'Membres',
  [ModuleCode.PAYMENT]: 'Paiement',
  [ModuleCode.PLANNING]: 'Planning',
  [ModuleCode.COMMUNICATION]: 'Communication',
  [ModuleCode.ACCOUNTING]: 'Comptabilité',
  [ModuleCode.SUBSIDIES]: 'Subventions',
  [ModuleCode.SPONSORING]: 'Sponsoring',
  [ModuleCode.WEBSITE]: 'Site web',
  [ModuleCode.BLOG]: 'Blog',
  [ModuleCode.SHOP]: 'Boutique',
  [ModuleCode.CLUB_LIFE]: 'Vie du club',
  [ModuleCode.EVENTS]: 'Événements',
  [ModuleCode.BOOKING]: 'Réservations',
};

async function seedModuleDefinitions(): Promise<void> {
  for (const code of Object.values(ModuleCode)) {
    const row: Prisma.ModuleDefinitionCreateInput = {
      code,
      label: MODULE_LABELS[code],
      isRequired: code === ModuleCode.MEMBERS,
    };
    await prisma.moduleDefinition.upsert({
      where: { code },
      create: row,
      update: {
        label: row.label,
        isRequired: row.isRequired,
      },
    });
  }
}

async function main(): Promise<void> {
  await seedModuleDefinitions();

  const demoEmail = 'admin@clubflow.local';
  const demoPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!';
  const passwordHash = await bcrypt.hash(demoPassword, 10);

  const clubId = randomUUID();
  const userId = randomUUID();

  await prisma.club.upsert({
    where: { slug: 'demo-club' },
    create: {
      id: clubId,
      name: 'Club démo',
      slug: 'demo-club',
    },
    update: { name: 'Club démo' },
  });

  const club = await prisma.club.findUniqueOrThrow({
    where: { slug: 'demo-club' },
  });

  await prisma.user.upsert({
    where: { email: demoEmail },
    create: {
      id: userId,
      email: demoEmail,
      passwordHash,
      displayName: 'Admin démo',
    },
    update: {
      passwordHash,
      displayName: 'Admin démo',
    },
  });

  const user = await prisma.user.findUniqueOrThrow({
    where: { email: demoEmail },
  });

  await prisma.clubMembership.upsert({
    where: {
      userId_clubId: { userId: user.id, clubId: club.id },
    },
    create: {
      id: randomUUID(),
      userId: user.id,
      clubId: club.id,
      role: MembershipRole.CLUB_ADMIN,
    },
    update: { role: MembershipRole.CLUB_ADMIN },
  });

  await prisma.clubModule.upsert({
    where: {
      clubId_moduleCode: { clubId: club.id, moduleCode: ModuleCode.MEMBERS },
    },
    create: {
      id: randomUUID(),
      clubId: club.id,
      moduleCode: ModuleCode.MEMBERS,
      enabled: true,
      enabledAt: new Date(),
    },
    update: {
      enabled: true,
      enabledAt: new Date(),
      disabledAt: null,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
