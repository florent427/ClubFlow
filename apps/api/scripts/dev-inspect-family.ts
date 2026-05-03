import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const fams = await prisma.family.findMany({
    select: {
      id: true,
      clubId: true,
      familyMembers: {
        select: {
          id: true,
          linkRole: true,
          memberId: true,
          contactId: true,
          member: { select: { firstName: true, lastName: true, userId: true } },
          contact: { select: { firstName: true, lastName: true, userId: true } },
        },
      },
    },
  });
  for (const f of fams) {
    console.log(`\nFamily ${f.id.slice(0, 8)} club=${f.clubId.slice(0, 8)}`);
    for (const fm of f.familyMembers) {
      const t = fm.member
        ? `Member ${fm.member.firstName} ${fm.member.lastName} uid=${fm.member.userId?.slice(0, 8) ?? 'null'}`
        : fm.contact
          ? `Contact ${fm.contact.firstName} ${fm.contact.lastName} uid=${fm.contact.userId?.slice(0, 8) ?? 'null'}`
          : '?';
      console.log(`  FM ${fm.id.slice(0, 8)} role=${fm.linkRole} → ${t}`);
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
