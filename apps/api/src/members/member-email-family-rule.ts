import { BadRequestException } from '@nestjs/common';
import { MemberStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

const EMAIL_DUPLICATE_MSG =
  'Cette adresse e-mail est déjà utilisée par un autre adhérent. Les doublons ne sont autorisés que pour des membres du même foyer.';

export type ClubMemberEmailDuplicateResolution =
  | { kind: 'clear' }
  | {
      kind: 'suggest_family';
      familyId: string;
      sharedEmail: string;
      existingMembers: { firstName: string; lastName: string }[];
    }
  | { kind: 'blocked'; message: string };

export function normalizeMemberEmail(email: string): string {
  return email.trim().toLowerCase();
}

type PrismaMemberFamily = Pick<PrismaService, 'member' | 'familyMember'>;

/**
 * Règle club : pas deux fiches actives avec la même e-mail sauf si les deux
 * sont rattachées au même foyer (`familyId` identique).
 *
 * @param options.assumeMemberFamilyId — `undefined` : déduit du lien actuel en base pour `memberId`.
 *   Sinon valeur explicite (ex. foyer cible d’un transfert) ; `null` = adhérent sans foyer.
 */
export async function assertMemberEmailAllowedInClub(
  prisma: PrismaMemberFamily,
  clubId: string,
  email: string,
  options: {
    memberId: string | null;
    assumeMemberFamilyId?: string | null;
  },
): Promise<void> {
  const norm = normalizeMemberEmail(email);
  if (!norm) {
    return;
  }

  const others = await prisma.member.findMany({
    where: {
      clubId,
      status: MemberStatus.ACTIVE,
      ...(options.memberId ? { NOT: { id: options.memberId } } : {}),
    },
    select: { id: true, email: true },
  });
  const conflicts = others.filter(
    (o) => normalizeMemberEmail(o.email) === norm,
  );
  if (conflicts.length === 0) {
    return;
  }

  const idsForFamilies = [
    ...(options.memberId ? [options.memberId] : []),
    ...conflicts.map((c) => c.id),
  ];
  const famRows = await prisma.familyMember.findMany({
    where: { memberId: { in: idsForFamilies } },
    select: { memberId: true, familyId: true },
  });
  const famByMember = new Map(famRows.map((r) => [r.memberId, r.familyId]));

  let subjectFamilyId: string | null;
  if (options.assumeMemberFamilyId !== undefined) {
    subjectFamilyId = options.assumeMemberFamilyId;
  } else if (options.memberId) {
    subjectFamilyId = famByMember.get(options.memberId) ?? null;
  } else {
    subjectFamilyId = null;
  }

  for (const o of conflicts) {
    const oFam = famByMember.get(o.id) ?? null;
    const allowed =
      subjectFamilyId != null &&
      oFam != null &&
      subjectFamilyId === oFam;
    if (!allowed) {
      throw new BadRequestException(EMAIL_DUPLICATE_MSG);
    }
  }
}

/**
 * Pour l’UI de création de fiche : indique si l’e-mail est déjà prise et, le cas échéant,
 * si le rattachement à un foyer existant permettrait de respecter la règle club.
 */
export async function resolveClubMemberEmailDuplicateForCreate(
  prisma: PrismaMemberFamily,
  clubId: string,
  email: string,
): Promise<ClubMemberEmailDuplicateResolution> {
  const norm = normalizeMemberEmail(email);
  if (!norm) {
    return { kind: 'clear' };
  }

  const others = await prisma.member.findMany({
    where: {
      clubId,
      status: MemberStatus.ACTIVE,
    },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  const conflicts = others.filter(
    (o) => normalizeMemberEmail(o.email) === norm,
  );
  if (conflicts.length === 0) {
    return { kind: 'clear' };
  }

  const famRows = await prisma.familyMember.findMany({
    where: { memberId: { in: conflicts.map((c) => c.id) } },
    select: { memberId: true, familyId: true },
  });
  const famByMember = new Map(famRows.map((r) => [r.memberId, r.familyId]));

  const familyIds = conflicts.map((c) => famByMember.get(c.id) ?? null);
  if (familyIds.some((id) => id == null)) {
    return {
      kind: 'blocked',
      message:
        'Un adhérent sans foyer utilise déjà cette e-mail. Modifiez l’e-mail ou rattachez d’abord l’autre fiche à un foyer.',
    };
  }
  const unique = new Set(familyIds as string[]);
  if (unique.size !== 1) {
    return {
      kind: 'blocked',
      message:
        'Cette e-mail est utilisée dans plusieurs foyers distincts. Corrigez les fiches existantes avant d’ajouter une nouvelle fiche.',
    };
  }
  const familyId = [...unique][0]!;
  return {
    kind: 'suggest_family',
    familyId,
    sharedEmail: norm,
    existingMembers: conflicts.map((c) => ({
      firstName: c.firstName,
      lastName: c.lastName,
    })),
  };
}

/**
 * Avant création d’un foyer : chaque membre du lot ne doit pas partager son e-mail
 * avec un adhérent actif **hors** de ce lot (doublons uniquement entre membres du lot).
 */
export async function assertEmailsForNewFamilyBatch(
  prisma: PrismaMemberFamily,
  clubId: string,
  batchMemberIds: string[],
): Promise<void> {
  const batch = new Set(batchMemberIds);
  const members = await prisma.member.findMany({
    where: {
      id: { in: [...batch] },
      clubId,
      status: MemberStatus.ACTIVE,
    },
    select: { id: true, email: true },
  });
  if (members.length !== batchMemberIds.length) {
    throw new BadRequestException(
      'Tous les membres doivent exister, être actifs et appartenir au club',
    );
  }
  for (const m of members) {
    const norm = normalizeMemberEmail(m.email);
    if (!norm) continue;
    const others = await prisma.member.findMany({
      where: {
        clubId,
        status: MemberStatus.ACTIVE,
        NOT: { id: m.id },
      },
      select: { id: true, email: true },
    });
    for (const o of others) {
      if (normalizeMemberEmail(o.email) !== norm) {
        continue;
      }
      if (batch.has(o.id)) {
        continue;
      }
      throw new BadRequestException(EMAIL_DUPLICATE_MSG);
    }
  }
}

/** Dissoudre un foyer : interdit si plusieurs membres du foyer partagent la même e-mail (sinon fiches seules invalides). */
export async function assertFamilyMayBeDissolved(
  prisma: PrismaMemberFamily,
  familyId: string,
): Promise<void> {
  const links = await prisma.familyMember.findMany({
    where: { familyId },
    include: {
      member: { select: { email: true, status: true } },
    },
  });
  const counts = new Map<string, number>();
  for (const fm of links) {
    if (!fm.member || fm.member.status !== MemberStatus.ACTIVE) {
      continue;
    }
    const n = normalizeMemberEmail(fm.member.email);
    if (!n) continue;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  if ([...counts.values()].some((c) => c > 1)) {
    throw new BadRequestException(
      'Impossible de supprimer ce foyer : plusieurs adhérents y partagent la même e-mail. Modifiez les adresses ou les rattachements avant de dissoudre le foyer.',
    );
  }
}
