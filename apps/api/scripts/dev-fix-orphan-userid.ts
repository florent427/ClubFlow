/**
 * Réparation ponctuelle pour le bug "le userId du payeur a été attribué
 * à tous les Members enfants pendant la fusion".
 *
 * Ce script :
 *   1. Détecte les Members où `userId` correspond à un Contact d'une
 *      AUTRE personne dans le foyer (mismatch firstName/lastName entre
 *      Member et Contact qui partagent le User).
 *   2. Décroche le userId du Member.
 *   3. Pour les Members où `userId` est null mais l'email correspond
 *      au User, et que le Contact PAYER existe dans le foyer pour ce
 *      User : assigne le userId au Member dont firstName+lastName
 *      matche le Contact + migre le rôle PAYER.
 *
 * Usage :
 *   cd apps/api
 *   NODE_ENV=development npx ts-node \
 *     --compiler-options "{\"module\":\"CommonJS\"}" \
 *     scripts/dev-fix-orphan-userid.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function norm(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refus en production.');
  }

  // Étape 1 : détacher les userId mal attribués
  const allMembersWithUserId = await prisma.member.findMany({
    where: { userId: { not: null } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      userId: true,
      clubId: true,
      user: { select: { email: true } },
    },
  });

  let detached = 0;
  for (const m of allMembersWithUserId) {
    if (!m.user?.email || !m.userId) continue;
    const contact = await prisma.contact.findFirst({
      where: { userId: m.userId, clubId: m.clubId },
      select: { firstName: true, lastName: true },
    });
    if (!contact) continue;
    // Si le Member et le Contact ne partagent PAS la même identité,
    // on a un mauvais rattachement (bug ancien finalizePendingItems).
    const sameIdentity =
      norm(contact.firstName) === norm(m.firstName) &&
      norm(contact.lastName) === norm(m.lastName);
    if (!sameIdentity) {
      console.log(
        `  ❌ Member ${m.firstName} ${m.lastName} rattaché à tort au User ${m.user.email} (Contact = ${contact.firstName} ${contact.lastName}) — détacher`,
      );
      await prisma.member.update({
        where: { id: m.id },
        data: { userId: null },
      });
      detached++;
    }
  }

  // Étape 2 : pour chaque Contact PAYER, trouver le Member ACTIVE qui
  // matche son identité dans le même club (et pas encore rattaché à
  // un User), et le rattacher proprement.
  const contactsPayer = await prisma.familyMember.findMany({
    where: {
      linkRole: 'PAYER',
      contactId: { not: null },
    },
    select: {
      id: true,
      familyId: true,
      contactId: true,
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          userId: true,
          clubId: true,
        },
      },
    },
  });

  let promoted = 0;
  for (const fm of contactsPayer) {
    if (!fm.contact || !fm.contactId) continue;
    const c = fm.contact;
    // Trouve le Member ACTIVE de la même identité dans le même club,
    // sans userId pour l'instant.
    const candidates = await prisma.member.findMany({
      where: {
        clubId: c.clubId,
        userId: null,
        status: 'ACTIVE',
      },
      select: { id: true, firstName: true, lastName: true },
    });
    const match = candidates.find(
      (m) =>
        norm(m.firstName) === norm(c.firstName) &&
        norm(m.lastName) === norm(c.lastName),
    );
    if (!match) continue;
    // Vérifie qu'il n'y a pas déjà un Member rattaché à ce User dans ce club
    const conflict = await prisma.member.findFirst({
      where: { clubId: c.clubId, userId: c.userId },
      select: { id: true },
    });
    if (conflict) {
      console.log(
        `  ⏭️  Member ${match.firstName} ${match.lastName} : un autre Member est déjà rattaché à ce User (skip)`,
      );
      continue;
    }
    console.log(
      `  ✅ Promotion : Member ${match.firstName} ${match.lastName} ← Contact ${c.firstName} ${c.lastName} → User ${c.userId.slice(0, 8)}`,
    );
    await prisma.member.update({
      where: { id: match.id },
      data: { userId: c.userId },
    });
    // Migre le rôle PAYER : si le Member a déjà un FamilyMember row
    // dans la famille, on le supprime, puis on update le PAYER row.
    const dupMemberLink = await prisma.familyMember.findFirst({
      where: { familyId: fm.familyId, memberId: match.id },
      select: { id: true },
    });
    if (dupMemberLink) {
      await prisma.familyMember.delete({ where: { id: dupMemberLink.id } });
    }
    await prisma.familyMember.update({
      where: { id: fm.id },
      data: { memberId: match.id, contactId: null },
    });
    promoted++;
  }

  console.log(`\n${detached} userId détachés, ${promoted} Members promus.`);
}

main()
  .catch((e) => {
    console.error('❌', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
