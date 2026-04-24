import { randomUUID } from 'crypto';
import {
  PrismaClient,
  ClubSendingDomainPurpose,
  ClubSendingDomainVerificationStatus,
  MemberClubRole,
  MemberCivility,
  MembershipRole,
  type Prisma,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ModuleCode } from '../src/domain/module-registry/module-codes';

const prisma = new PrismaClient();

const MODULE_LABELS: Record<ModuleCode, string> = {
  [ModuleCode.MEMBERS]: 'Membres',
  [ModuleCode.FAMILIES]: 'Familles',
  [ModuleCode.PAYMENT]: 'Paiement',
  [ModuleCode.PLANNING]: 'Planning',
  [ModuleCode.COMMUNICATION]: 'Communication',
  [ModuleCode.MESSAGING]: 'Messagerie',
  [ModuleCode.ACCOUNTING]: 'Comptabilité',
  [ModuleCode.SUBSIDIES]: 'Subventions',
  [ModuleCode.SPONSORING]: 'Sponsoring',
  [ModuleCode.WEBSITE]: 'Site web',
  [ModuleCode.BLOG]: 'Blog',
  [ModuleCode.SHOP]: 'Boutique',
  [ModuleCode.CLUB_LIFE]: 'Vie du club',
  [ModuleCode.EVENTS]: 'Événements',
  [ModuleCode.BOOKING]: 'Réservations',
  [ModuleCode.PROJECTS]: 'Événements / Projets',
};

async function seedModuleDefinitions(): Promise<void> {
  for (const code of Object.values(ModuleCode)) {
    const row: Prisma.ModuleDefinitionCreateInput = {
      code,
      label: MODULE_LABELS[code],
      isRequired:
        code === ModuleCode.MEMBERS || code === ModuleCode.FAMILIES,
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

  await prisma.clubSendingDomain.upsert({
    where: {
      clubId_fqdn: { clubId: club.id, fqdn: 'mail.demo.clubflow.local' },
    },
    create: {
      id: randomUUID(),
      clubId: club.id,
      fqdn: 'mail.demo.clubflow.local',
      purpose: ClubSendingDomainPurpose.TRANSACTIONAL,
      verificationStatus: ClubSendingDomainVerificationStatus.VERIFIED,
    },
    update: {
      verificationStatus: ClubSendingDomainVerificationStatus.VERIFIED,
    },
  });

  console.warn(
    `[seed] Renseigner CLUB_ID=${club.id} dans apps/api/.env (MVP portail / inscription contact).`,
  );

  await prisma.user.upsert({
    where: { email: demoEmail },
    create: {
      id: userId,
      email: demoEmail,
      passwordHash,
      emailVerifiedAt: new Date(),
      displayName: 'Admin démo',
    },
    update: {
      passwordHash,
      emailVerifiedAt: new Date(),
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

  /** Fiche membre liée au même compte : nécessaire pour `viewerProfiles` / portail membre. */
  await prisma.member.upsert({
    where: {
      clubId_userId: { clubId: club.id, userId: user.id },
    },
    create: {
      id: randomUUID(),
      clubId: club.id,
      userId: user.id,
      firstName: 'Compte',
      lastName: 'Portail démo',
      pseudo: 'compte_portail_demo',
      civility: MemberCivility.MR,
      email: demoEmail,
      roleAssignments: {
        create: [{ role: MemberClubRole.STUDENT }],
      },
    },
    update: {
      status: 'ACTIVE',
      civility: MemberCivility.MR,
      email: demoEmail,
      pseudo: 'compte_portail_demo',
    },
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

  await prisma.clubModule.upsert({
    where: {
      clubId_moduleCode: { clubId: club.id, moduleCode: ModuleCode.FAMILIES },
    },
    create: {
      id: randomUUID(),
      clubId: club.id,
      moduleCode: ModuleCode.FAMILIES,
      enabled: true,
      enabledAt: new Date(),
    },
    update: {
      enabled: true,
      enabledAt: new Date(),
      disabledAt: null,
    },
  });

  await prisma.clubModule.upsert({
    where: {
      clubId_moduleCode: { clubId: club.id, moduleCode: ModuleCode.PLANNING },
    },
    create: {
      id: randomUUID(),
      clubId: club.id,
      moduleCode: ModuleCode.PLANNING,
      enabled: true,
      enabledAt: new Date(),
    },
    update: {
      enabled: true,
      enabledAt: new Date(),
      disabledAt: null,
    },
  });

  await prisma.clubModule.upsert({
    where: {
      clubId_moduleCode: { clubId: club.id, moduleCode: ModuleCode.PAYMENT },
    },
    create: {
      id: randomUUID(),
      clubId: club.id,
      moduleCode: ModuleCode.PAYMENT,
      enabled: true,
      enabledAt: new Date(),
    },
    update: {
      enabled: true,
      enabledAt: new Date(),
      disabledAt: null,
    },
  });

  await prisma.clubModule.upsert({
    where: {
      clubId_moduleCode: { clubId: club.id, moduleCode: ModuleCode.MESSAGING },
    },
    create: {
      id: randomUUID(),
      clubId: club.id,
      moduleCode: ModuleCode.MESSAGING,
      enabled: true,
      enabledAt: new Date(),
    },
    update: {
      enabled: true,
      enabledAt: new Date(),
      disabledAt: null,
    },
  });

  let gEnfant = await prisma.dynamicGroup.findFirst({
    where: { clubId: club.id, name: 'Enfants' },
  });
  if (!gEnfant) {
    gEnfant = await prisma.dynamicGroup.create({
      data: {
        clubId: club.id,
        name: 'Enfants',
        minAge: 6,
        maxAge: 17,
      },
    });
  }

  let gAdulte = await prisma.dynamicGroup.findFirst({
    where: { clubId: club.id, name: 'Adultes' },
  });
  if (!gAdulte) {
    gAdulte = await prisma.dynamicGroup.create({
      data: {
        clubId: club.id,
        name: 'Adultes',
        minAge: 18,
        maxAge: null,
      },
    });
  }

  let season = await prisma.clubSeason.findFirst({
    where: { clubId: club.id, label: '2025-2026' },
  });
  if (!season) {
    await prisma.clubSeason.updateMany({
      where: { clubId: club.id, isActive: true },
      data: { isActive: false },
    });
    season = await prisma.clubSeason.create({
      data: {
        clubId: club.id,
        label: '2025-2026',
        startsOn: new Date('2025-09-01'),
        endsOn: new Date('2026-08-31'),
        isActive: true,
      },
    });
  } else {
    await prisma.clubSeason.updateMany({
      where: { clubId: club.id, isActive: true, NOT: { id: season.id } },
      data: { isActive: false },
    });
    await prisma.clubSeason.update({
      where: { id: season.id },
      data: { isActive: true },
    });
  }

  for (const def of [
    {
      label: 'Cotisation Enfant',
      annualAmountCents: 150_00,
      monthlyAmountCents: 15_00,
      minAge: gEnfant.minAge,
      maxAge: gEnfant.maxAge,
    },
    {
      label: 'Cotisation Adulte',
      annualAmountCents: 200_00,
      monthlyAmountCents: 20_00,
      minAge: gAdulte.minAge,
      maxAge: gAdulte.maxAge,
    },
  ] as const) {
    const exists = await prisma.membershipProduct.findFirst({
      where: { clubId: club.id, label: def.label, archivedAt: null },
    });
    if (!exists) {
      await prisma.membershipProduct.create({
        data: {
          clubId: club.id,
          label: def.label,
          annualAmountCents: def.annualAmountCents,
          monthlyAmountCents: def.monthlyAmountCents,
          minAge: def.minAge ?? null,
          maxAge: def.maxAge ?? null,
        },
      });
    }
  }

  await prisma.club.update({
    where: { id: club.id },
    data: {
      membershipFamilyDiscountFromNth: 2,
      membershipFamilyAdjustmentType: 'PERCENT_BP',
      membershipFamilyAdjustmentValue: -500,
    },
  });

  // Frais uniques démo : licence fédérale (LICENSE, autoApply) + cotisation club (MANDATORY, autoApply)
  for (const fee of [
    {
      label: 'Licence fédérale 2025-2026',
      amountCents: 42_00,
      kind: 'LICENSE' as const,
      autoApply: true,
    },
    {
      label: 'Cotisation club',
      amountCents: 15_00,
      kind: 'MANDATORY' as const,
      autoApply: true,
    },
  ]) {
    const exists = await prisma.membershipOneTimeFee.findFirst({
      where: { clubId: club.id, label: fee.label, archivedAt: null },
    });
    if (!exists) {
      await prisma.membershipOneTimeFee.create({
        data: {
          clubId: club.id,
          label: fee.label,
          amountCents: fee.amountCents,
          kind: fee.kind,
          autoApply: fee.autoApply,
        },
      });
    }
  }

  const pwdHint =
    process.env.SEED_ADMIN_PASSWORD === undefined
      ? 'ChangeMe! (défaut)'
      : '(valeur de SEED_ADMIN_PASSWORD)';
  console.log(`
ClubFlow — seed terminé
  GraphQL : http://localhost:${process.env.PORT ?? 3000}/graphql
  Login   : ${demoEmail} / ${pwdHint}
  Header  : X-Club-Id: ${club.id}
`);
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
