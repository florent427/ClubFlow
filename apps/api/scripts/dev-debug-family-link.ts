/**
 * Inspecte l'état des Members + Contacts + FamilyMember rows pour
 * comprendre pourquoi un user perd l'accès facturation après fusion.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const users = await prisma.user.findMany({
    select: { id: true, email: true },
  });
  console.log(`👤 ${users.length} users`);

  for (const u of users) {
    console.log(`\n=== User ${u.email} (${u.id.slice(0, 8)}) ===`);

    const members = await prisma.member.findMany({
      where: { userId: u.id },
      select: {
        id: true,
        clubId: true,
        firstName: true,
        lastName: true,
        email: true,
        userId: true,
        status: true,
      },
    });
    console.log(`  Members rattachés (userId=user.id) : ${members.length}`);
    for (const m of members) {
      console.log(
        `    M:${m.id.slice(0, 8)} ${m.firstName} ${m.lastName} email=${m.email} club=${m.clubId.slice(0, 8)}`,
      );
    }

    const orphanMembers = await prisma.member.findMany({
      where: { userId: null, email: u.email, status: 'ACTIVE' },
      select: {
        id: true,
        clubId: true,
        firstName: true,
        lastName: true,
      },
    });
    console.log(`  Members orphelins (userId=null, email match) : ${orphanMembers.length}`);
    for (const m of orphanMembers) {
      console.log(
        `    M:${m.id.slice(0, 8)} ${m.firstName} ${m.lastName} club=${m.clubId.slice(0, 8)}`,
      );
    }

    const contacts = await prisma.contact.findMany({
      where: { userId: u.id },
      select: { id: true, clubId: true, firstName: true, lastName: true },
    });
    console.log(`  Contacts : ${contacts.length}`);
    for (const c of contacts) {
      console.log(
        `    C:${c.id.slice(0, 8)} ${c.firstName} ${c.lastName} club=${c.clubId.slice(0, 8)}`,
      );
    }

    // FamilyMembers links
    const fmRows = await prisma.familyMember.findMany({
      where: {
        OR: [
          { member: { userId: u.id } },
          { contact: { userId: u.id } },
        ],
      },
      select: {
        id: true,
        familyId: true,
        memberId: true,
        contactId: true,
        linkRole: true,
        member: {
          select: { firstName: true, lastName: true, userId: true },
        },
        contact: { select: { firstName: true, lastName: true } },
      },
    });
    console.log(`  FamilyMember rows : ${fmRows.length}`);
    for (const fm of fmRows) {
      const target = fm.member
        ? `Member ${fm.member.firstName} ${fm.member.lastName} (userId=${fm.member.userId?.slice(0, 8) ?? 'null'})`
        : fm.contact
          ? `Contact ${fm.contact.firstName} ${fm.contact.lastName}`
          : '???';
      console.log(
        `    FM:${fm.id.slice(0, 8)} fam=${fm.familyId.slice(0, 8)} role=${fm.linkRole} → ${target}`,
      );
    }
  }
}

main()
  .catch((e) => {
    console.error('❌', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
