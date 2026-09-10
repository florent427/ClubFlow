import { MemberStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { memberMatchesDynamicGroup } from './dynamic-group-matcher';

/**
 * Appartenance à un groupe dynamique — la SEULE définition, partagée par les
 * compteurs, le tableau de bord, les campagnes, les convocations, les salons
 * et les réservations.
 *
 * Un membre ACTIF fait partie du groupe s'il correspond aux critères (âge,
 * grade) OU s'il y a été ajouté à la main (case cochée dans sa fiche, ou
 * ajout depuis le groupe). Avant, chaque écran choisissait l'une des deux
 * notions et l'admin qui cochait un groupe dans une fiche ne le voyait
 * compté nulle part.
 */
export type DynamicGroupMemberSource = 'CRITERIA' | 'MANUAL' | 'BOTH';

type Db = Pick<PrismaService, 'dynamicGroup' | 'member' | 'memberDynamicGroup'>;

/** Membres actifs du groupe, avec l'origine de leur appartenance. */
export async function resolveDynamicGroupMembers(
  db: Db,
  clubId: string,
  dynamicGroupId: string,
  referenceDate: Date = new Date(),
): Promise<Map<string, DynamicGroupMemberSource>> {
  const group = await db.dynamicGroup.findFirst({
    where: { id: dynamicGroupId, clubId },
    include: { gradeFilters: true },
  });
  const out = new Map<string, DynamicGroupMemberSource>();
  if (!group) return out;
  const criteria = {
    minAge: group.minAge,
    maxAge: group.maxAge,
    gradeLevelIds: group.gradeFilters.map((g) => g.gradeLevelId),
  };
  const [members, assigned] = await Promise.all([
    db.member.findMany({
      where: { clubId, status: MemberStatus.ACTIVE },
      select: { id: true, status: true, birthDate: true, gradeLevelId: true },
    }),
    db.memberDynamicGroup.findMany({
      where: { clubId, dynamicGroupId },
      select: { memberId: true },
    }),
  ]);
  const manual = new Set(assigned.map((a) => a.memberId));
  for (const m of members) {
    const byCriteria = memberMatchesDynamicGroup(m, criteria, referenceDate);
    const byManual = manual.has(m.id);
    if (byCriteria && byManual) out.set(m.id, 'BOTH');
    else if (byCriteria) out.set(m.id, 'CRITERIA');
    else if (byManual) out.set(m.id, 'MANUAL');
  }
  return out;
}

/** Union des membres actifs de plusieurs groupes (audience d'une campagne, portée d'un salon…). */
export async function resolveDynamicGroupsMemberIds(
  db: Db,
  clubId: string,
  dynamicGroupIds: string[],
  referenceDate: Date = new Date(),
): Promise<Set<string>> {
  const out = new Set<string>();
  for (const gid of new Set(dynamicGroupIds)) {
    const members = await resolveDynamicGroupMembers(db, clubId, gid, referenceDate);
    for (const id of members.keys()) out.add(id);
  }
  return out;
}

export async function memberBelongsToDynamicGroup(
  db: Db,
  clubId: string,
  memberId: string,
  dynamicGroupId: string,
  referenceDate: Date = new Date(),
): Promise<boolean> {
  const members = await resolveDynamicGroupMembers(
    db,
    clubId,
    dynamicGroupId,
    referenceDate,
  );
  return members.has(memberId);
}
