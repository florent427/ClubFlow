import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FamilyMemberLinkRole,
  MemberStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertEmailsForNewFamilyBatch,
  assertFamilyMayBeDissolved,
  assertMemberEmailAllowedInClub,
  normalizeMemberEmail,
} from '../members/member-email-family-rule';
import { CreateHouseholdGroupInput } from './dto/create-household-group.input';
import { CreateClubFamilyInput } from './dto/create-club-family.input';
import { SetFamilyHouseholdGroupInput } from './dto/set-family-household-group.input';
import { SetHouseholdGroupCarrierInput } from './dto/set-household-group-carrier.input';
import { UpdateClubFamilyInput } from './dto/update-club-family.input';
import { validateFamilyCreationInput } from './family-payer-rules';
import { HouseholdGroupGraph } from './models/household-group-graph.model';
import { FamilyGraph } from './models/family-graph.model';
import { ViewerProfileGraph } from './models/viewer-profile.model';
import { shouldIncludeMemberInHouseholdViewerProfiles } from './viewer-profile-rules';

/** Extrait pour tests unitaires (règle spec : au moins un lien et aucun PAYER). */
export function computeFamilyNeedsPayer(
  links: { linkRole: FamilyMemberLinkRole }[],
): boolean {
  if (links.length === 0) {
    return false;
  }
  /** Un seul membre rattaché = payeur implicite (pas de « payeur manquant »). */
  if (links.length === 1) {
    return false;
  }
  return !links.some((l) => l.linkRole === FamilyMemberLinkRole.PAYER);
}

/**
 * Payeur explicite, seul membre du foyer (payeur implicite), ou fiche sans foyer.
 */
export function memberEligibleForContactPayerAutoLink(
  familyLink: {
    linkRole: FamilyMemberLinkRole;
    memberCountInFamily: number;
  } | null,
): boolean {
  if (!familyLink) {
    return true;
  }
  if (familyLink.memberCountInFamily <= 1) {
    return true;
  }
  return familyLink.linkRole === FamilyMemberLinkRole.PAYER;
}

@Injectable()
export class FamiliesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Si le foyer ne contient plus qu’un membre et qu’il n’est pas encore payeur,
   * le passer en PAYER (adhérent seul = payeur de fait).
   */
  async ensureSoleFamilyMemberIsPayer(familyId: string): Promise<void> {
    await this.ensureSoleFamilyMemberIsPayerWithClient(this.prisma, familyId);
  }

  private async ensureSoleFamilyMemberIsPayerWithClient(
    client: Pick<Prisma.TransactionClient, 'familyMember'>,
    familyId: string,
  ): Promise<void> {
    const links = await client.familyMember.findMany({ where: { familyId } });
    if (
      links.length !== 1 ||
      links[0].linkRole === FamilyMemberLinkRole.PAYER
    ) {
      return;
    }
    await client.familyMember.update({
      where: { id: links[0].id },
      data: { linkRole: FamilyMemberLinkRole.PAYER },
    });
  }

  /**
   * Profils portail : foyers sans groupe (tous les membres actifs, comportement historique)
   * + foyers étendus (soi, mineurs du groupe ; pas l’autre adulte / co-parent).
   */
  async listViewerProfiles(userId: string): Promise<ViewerProfileGraph[]> {
    const now = new Date();
    const inUserFamilies = await this.prisma.familyMember.findMany({
      where: { member: { userId } },
      select: { familyId: true },
    });
    const directFamilyIds = [...new Set(inUserFamilies.map((f) => f.familyId))];

    const familyRows =
      directFamilyIds.length === 0
        ? []
        : await this.prisma.family.findMany({
            where: { id: { in: directFamilyIds } },
            select: { id: true, householdGroupId: true },
          });

    const legacyFamilyIds = familyRows
      .filter((f) => f.householdGroupId == null)
      .map((f) => f.id);
    const householdGroupIds = [
      ...new Set(
        familyRows
          .map((f) => f.householdGroupId)
          .filter((id): id is string => id != null),
      ),
    ];

    const byMember = new Map<string, ViewerProfileGraph>();

    const merge = (p: ViewerProfileGraph) => {
      const prev = byMember.get(p.memberId);
      if (!prev) {
        byMember.set(p.memberId, p);
        return;
      }
      byMember.set(p.memberId, {
        memberId: p.memberId,
        clubId: p.clubId,
        firstName: p.firstName,
        lastName: p.lastName,
        isPrimaryProfile: prev.isPrimaryProfile || p.isPrimaryProfile,
        familyId: p.householdGroupId != null ? p.familyId : prev.familyId,
        householdGroupId: prev.householdGroupId ?? p.householdGroupId,
      });
    };

    if (legacyFamilyIds.length > 0) {
      const fromLegacy = await this.prisma.familyMember.findMany({
        where: { familyId: { in: legacyFamilyIds } },
        include: { member: true },
      });
      for (const fm of fromLegacy) {
        if (fm.member.status !== MemberStatus.ACTIVE) {
          continue;
        }
        merge({
          memberId: fm.member.id,
          clubId: fm.member.clubId,
          firstName: fm.member.firstName,
          lastName: fm.member.lastName,
          isPrimaryProfile: fm.linkRole === FamilyMemberLinkRole.PAYER,
          familyId: fm.familyId,
          householdGroupId: null,
        });
      }
    }

    for (const hgId of householdGroupIds) {
      const groupFamilyIds = (
        await this.prisma.family.findMany({
          where: { householdGroupId: hgId },
          select: { id: true },
        })
      ).map((f) => f.id);
      if (groupFamilyIds.length === 0) {
        continue;
      }
      const rows = await this.prisma.familyMember.findMany({
        where: { familyId: { in: groupFamilyIds } },
        include: { member: true },
      });
      for (const fm of rows) {
        if (fm.member.status !== MemberStatus.ACTIVE) {
          continue;
        }
        if (
          !shouldIncludeMemberInHouseholdViewerProfiles(
            userId,
            fm.member,
            now,
          )
        ) {
          continue;
        }
        merge({
          memberId: fm.member.id,
          clubId: fm.member.clubId,
          firstName: fm.member.firstName,
          lastName: fm.member.lastName,
          isPrimaryProfile: fm.linkRole === FamilyMemberLinkRole.PAYER,
          familyId: fm.familyId,
          householdGroupId: hgId,
        });
      }
    }

    const seenIds = new Set(byMember.keys());
    const standalone = await this.prisma.member.findMany({
      where: {
        userId,
        status: MemberStatus.ACTIVE,
        NOT: { id: { in: [...seenIds] } },
      },
    });
    for (const m of standalone) {
      byMember.set(m.id, {
        memberId: m.id,
        clubId: m.clubId,
        firstName: m.firstName,
        lastName: m.lastName,
        isPrimaryProfile: true,
        familyId: null,
        householdGroupId: null,
      });
    }

    return [...byMember.values()];
  }

  async assertViewerHasProfile(
    userId: string,
    memberId: string,
  ): Promise<void> {
    const profiles = await this.listViewerProfiles(userId);
    if (!profiles.some((p) => p.memberId === memberId)) {
      throw new BadRequestException('Profil non accessible pour ce compte');
    }
  }

  private toFamilyGraph(row: {
    id: string;
    clubId: string;
    label: string | null;
    householdGroupId?: string | null;
    familyMembers: { id: string; memberId: string; linkRole: FamilyMemberLinkRole }[];
  }): FamilyGraph {
    const links = row.familyMembers.map((l) => ({
      id: l.id,
      memberId: l.memberId,
      linkRole: l.linkRole,
    }));
    return {
      id: row.id,
      clubId: row.clubId,
      label: row.label,
      householdGroupId: row.householdGroupId ?? null,
      needsPayer: computeFamilyNeedsPayer(row.familyMembers),
      links,
    };
  }

  async listClubFamilies(clubId: string): Promise<FamilyGraph[]> {
    const rows = await this.prisma.family.findMany({
      where: { clubId },
      orderBy: { createdAt: 'desc' },
      include: { familyMembers: true },
    });
    return rows.map((r) => this.toFamilyGraph(r));
  }

  async createClubFamily(
    clubId: string,
    input: CreateClubFamilyInput,
  ): Promise<FamilyGraph> {
    const msg = validateFamilyCreationInput({
      payerMemberId: input.payerMemberId,
      memberIds: input.memberIds,
    });
    if (msg) {
      throw new BadRequestException(msg);
    }

    const members = await this.prisma.member.findMany({
      where: { id: { in: input.memberIds }, clubId, status: MemberStatus.ACTIVE },
    });
    if (members.length !== input.memberIds.length) {
      throw new BadRequestException(
        'Tous les membres doivent exister, être actifs et appartenir au club',
      );
    }

    const already = await this.prisma.familyMember.findMany({
      where: { memberId: { in: input.memberIds } },
    });
    if (already.length > 0) {
      throw new BadRequestException(
        'Un des membres est déjà rattaché à un autre foyer',
      );
    }

    await assertEmailsForNewFamilyBatch(
      this.prisma,
      clubId,
      input.memberIds,
    );

    const row = await this.prisma.$transaction(async (tx) => {
      const family = await tx.family.create({
        data: {
          clubId,
          label: input.label ?? null,
          familyMembers: {
            create: input.memberIds.map((memberId) => ({
              memberId,
              linkRole:
                memberId === input.payerMemberId
                  ? FamilyMemberLinkRole.PAYER
                  : FamilyMemberLinkRole.MEMBER,
            })),
          },
        },
        include: { familyMembers: true },
      });
      return family;
    });

    const byNorm = new Map<string, string>();
    for (const m of members) {
      const n = normalizeMemberEmail(m.email);
      if (!byNorm.has(n)) {
        byNorm.set(n, m.email);
      }
    }
    for (const email of byNorm.values()) {
      await this.syncContactUserPayerMemberLinksByEmail(clubId, email);
    }

    return this.toFamilyGraph(row);
  }

  async updateClubFamily(
    clubId: string,
    input: UpdateClubFamilyInput,
  ): Promise<FamilyGraph> {
    const existing = await this.prisma.family.findFirst({
      where: { id: input.id, clubId },
      include: { familyMembers: true },
    });
    if (!existing) {
      throw new NotFoundException('Foyer introuvable');
    }
    if (input.label === undefined) {
      return this.toFamilyGraph(existing);
    }
    const labelNext =
      input.label === null || input.label.trim() === ''
        ? null
        : input.label.trim();
    const row = await this.prisma.family.update({
      where: { id: input.id },
      data: { label: labelNext },
      include: { familyMembers: true },
    });
    return this.toFamilyGraph(row);
  }

  async removeClubMemberFromFamily(
    clubId: string,
    memberId: string,
  ): Promise<boolean> {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, clubId },
    });
    if (!member) {
      throw new NotFoundException('Membre introuvable');
    }
    await assertMemberEmailAllowedInClub(
      this.prisma,
      clubId,
      member.email,
      {
        memberId,
        assumeMemberFamilyId: null,
      },
    );
    const previous = await this.prisma.familyMember.findFirst({
      where: { memberId },
      select: { familyId: true },
    });
    await this.prisma.familyMember.deleteMany({ where: { memberId } });
    if (previous) {
      await this.ensureSoleFamilyMemberIsPayer(previous.familyId);
      await this.syncContactLinksForFamilyMemberEmails(clubId, previous.familyId);
    }
    await this.syncContactUserPayerMemberLinksByEmail(clubId, member.email);
    return true;
  }

  async transferClubMemberToFamily(
    clubId: string,
    memberId: string,
    familyId: string,
    linkRole: FamilyMemberLinkRole,
  ): Promise<FamilyGraph> {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, clubId, status: MemberStatus.ACTIVE },
    });
    if (!member) {
      throw new NotFoundException('Membre introuvable ou inactif pour ce club');
    }

    const family = await this.prisma.family.findFirst({
      where: { id: familyId, clubId },
      include: { familyMembers: true },
    });
    if (!family) {
      throw new NotFoundException('Foyer introuvable');
    }

    const previousLink = await this.prisma.familyMember.findFirst({
      where: { memberId },
      select: { familyId: true },
    });
    const previousFamilyId = previousLink?.familyId ?? null;

    await assertMemberEmailAllowedInClub(
      this.prisma,
      clubId,
      member.email,
      {
        memberId,
        assumeMemberFamilyId: familyId,
      },
    );

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.familyMember.deleteMany({ where: { memberId } });
      if (
        previousFamilyId != null &&
        previousFamilyId !== familyId
      ) {
        await this.ensureSoleFamilyMemberIsPayerWithClient(
          tx,
          previousFamilyId,
        );
      }
      if (linkRole === FamilyMemberLinkRole.PAYER) {
        await tx.familyMember.updateMany({
          where: {
            familyId,
            linkRole: FamilyMemberLinkRole.PAYER,
          },
          data: { linkRole: FamilyMemberLinkRole.MEMBER },
        });
      }
      await tx.familyMember.create({
        data: { familyId, memberId, linkRole },
      });
      await this.ensureSoleFamilyMemberIsPayerWithClient(tx, familyId);
      return tx.family.findFirstOrThrow({
        where: { id: familyId },
        include: { familyMembers: true },
      });
    });

    await this.syncContactUserPayerMemberLinksByEmail(clubId, member.email);
    if (previousFamilyId != null) {
      await this.syncContactLinksForFamilyMemberEmails(clubId, previousFamilyId);
    }
    await this.syncContactLinksForFamilyMemberEmails(clubId, familyId);

    return this.toFamilyGraph(row);
  }

  async setClubFamilyPayer(clubId: string, memberId: string): Promise<FamilyGraph> {
    const link = await this.prisma.familyMember.findFirst({
      where: { memberId, family: { clubId } },
      include: { family: true },
    });
    if (!link) {
      throw new BadRequestException(
        "Ce membre n'est rattaché à aucun foyer de ce club",
      );
    }
    const { familyId } = link;

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.familyMember.updateMany({
        where: {
          familyId,
          linkRole: FamilyMemberLinkRole.PAYER,
        },
        data: { linkRole: FamilyMemberLinkRole.MEMBER },
      });
      await tx.familyMember.update({
        where: { id: link.id },
        data: { linkRole: FamilyMemberLinkRole.PAYER },
      });
      return tx.family.findFirstOrThrow({
        where: { id: familyId },
        include: { familyMembers: true },
      });
    });

    const payerEmail = await this.prisma.member.findFirst({
      where: { id: memberId, clubId },
      select: { email: true },
    });
    if (payerEmail) {
      await this.syncContactUserPayerMemberLinksByEmail(clubId, payerEmail.email);
    }

    return this.toFamilyGraph(row);
  }

  /**
   * Rattache le compte portail (contact + e-mail vérifié) aux fiches membres
   * « payeur » (rôle PAYER ou sans foyer / seul du foyer) dont l’e-mail correspond.
   */
  async syncContactUserPayerMemberLinks(
    clubId: string,
    userId: string,
    email?: string,
  ): Promise<void> {
    const contact = await this.prisma.contact.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
    if (!contact) {
      return;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true, email: true },
    });
    if (!user?.emailVerifiedAt) {
      return;
    }
    const norm = normalizeMemberEmail(email ?? user.email);
    await this.applyPayerMemberLinksForContact(clubId, userId, norm);
  }

  /**
   * Rejoue la liaison contact → membre payeur pour tous les contacts du club
   * dont l’e-mail est vérifié (action manuelle ou planifiée).
   */
  async syncAllContactPayerMemberLinksForClub(clubId: string): Promise<void> {
    const contacts = await this.prisma.contact.findMany({
      where: { clubId },
      include: { user: { select: { emailVerifiedAt: true, email: true } } },
    });
    for (const c of contacts) {
      if (!c.user.emailVerifiedAt) {
        continue;
      }
      await this.syncContactUserPayerMemberLinks(clubId, c.userId, c.user.email);
    }
  }

  /**
   * Pour chaque utilisateur contact vérifié du club ayant cet e-mail,
   * applique le rattachement payeur / adhérent seul.
   */
  async syncContactUserPayerMemberLinksByEmail(
    clubId: string,
    email: string,
  ): Promise<void> {
    const normalizedEmail = normalizeMemberEmail(email);
    const users = await this.prisma.user.findMany({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        emailVerifiedAt: { not: null },
        contacts: { some: { clubId } },
      },
      select: { id: true },
    });
    for (const u of users) {
      await this.applyPayerMemberLinksForContact(clubId, u.id, normalizedEmail);
    }
  }

  /** Déclenche une synchro par e-mail pour chaque membre encore lié au foyer. */
  async syncContactLinksForFamilyMemberEmails(
    clubId: string,
    familyId: string,
  ): Promise<void> {
    const links = await this.prisma.familyMember.findMany({
      where: { familyId },
      include: { member: { select: { email: true } } },
    });
    const seen = new Set<string>();
    for (const fm of links) {
      const norm = normalizeMemberEmail(fm.member.email);
      if (seen.has(norm)) {
        continue;
      }
      seen.add(norm);
      await this.syncContactUserPayerMemberLinksByEmail(clubId, fm.member.email);
    }
  }

  private async applyPayerMemberLinksForContact(
    clubId: string,
    contactUserId: string,
    normalizedEmail: string,
  ): Promise<void> {
    const members = await this.prisma.member.findMany({
      where: {
        clubId,
        status: MemberStatus.ACTIVE,
        email: { equals: normalizedEmail, mode: 'insensitive' },
      },
      include: {
        familyMembers: {
          take: 1,
          include: {
            family: {
              select: {
                familyMembers: { select: { id: true } },
              },
            },
          },
        },
      },
    });

    for (const m of members) {
      const linkRow = m.familyMembers[0];
      const familyLink =
        linkRow != null
          ? {
              linkRole: linkRow.linkRole,
              memberCountInFamily: linkRow.family.familyMembers.length,
            }
          : null;
      if (!memberEligibleForContactPayerAutoLink(familyLink)) {
        continue;
      }
      if (m.userId != null) {
        if (m.userId === contactUserId) {
          continue;
        }
        continue;
      }
      const clash = await this.prisma.member.findFirst({
        where: { clubId, userId: contactUserId, NOT: { id: m.id } },
      });
      if (clash) {
        continue;
      }
      await this.prisma.member.update({
        where: { id: m.id },
        data: { userId: contactUserId },
      });
    }
  }

  async deleteClubFamily(clubId: string, familyId: string): Promise<void> {
    const existing = await this.prisma.family.findFirst({
      where: { id: familyId, clubId },
    });
    if (!existing) {
      throw new NotFoundException('Foyer introuvable');
    }
    await assertFamilyMayBeDissolved(this.prisma, familyId);
    await this.prisma.$transaction(async (tx) => {
      await tx.householdGroup.updateMany({
        where: { carrierFamilyId: familyId },
        data: { carrierFamilyId: null },
      });
      await tx.family.delete({ where: { id: familyId } });
    });
  }

  async listClubHouseholdGroups(clubId: string): Promise<HouseholdGroupGraph[]> {
    const rows = await this.prisma.householdGroup.findMany({
      where: { clubId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      clubId: r.clubId,
      label: r.label ?? null,
      carrierFamilyId: r.carrierFamilyId ?? null,
    }));
  }

  async createHouseholdGroup(
    clubId: string,
    input: CreateHouseholdGroupInput,
  ): Promise<HouseholdGroupGraph> {
    if (input.carrierFamilyId) {
      const fam = await this.prisma.family.findFirst({
        where: { id: input.carrierFamilyId, clubId },
      });
      if (!fam) {
        throw new BadRequestException('Foyer porteur inconnu pour ce club');
      }
    }
    const row = await this.prisma.householdGroup.create({
      data: {
        clubId,
        label:
          input.label === undefined || input.label === null
            ? null
            : input.label.trim() === ''
              ? null
              : input.label.trim(),
        carrierFamilyId: input.carrierFamilyId ?? null,
      },
    });
    return {
      id: row.id,
      clubId: row.clubId,
      label: row.label ?? null,
      carrierFamilyId: row.carrierFamilyId ?? null,
    };
  }

  async setFamilyHouseholdGroup(
    clubId: string,
    input: SetFamilyHouseholdGroupInput,
  ): Promise<FamilyGraph> {
    const family = await this.prisma.family.findFirst({
      where: { id: input.familyId, clubId },
      include: { familyMembers: true },
    });
    if (!family) {
      throw new NotFoundException('Foyer introuvable');
    }
    if (input.householdGroupId === undefined) {
      return this.toFamilyGraph(family);
    }
    if (input.householdGroupId === null) {
      const updated = await this.prisma.family.update({
        where: { id: family.id },
        data: { householdGroupId: null },
        include: { familyMembers: true },
      });
      return this.toFamilyGraph(updated);
    }
    const grp = await this.prisma.householdGroup.findFirst({
      where: { id: input.householdGroupId, clubId },
    });
    if (!grp) {
      throw new BadRequestException('Groupe foyer inconnu pour ce club');
    }
    const updated = await this.prisma.family.update({
      where: { id: family.id },
      data: { householdGroupId: input.householdGroupId },
      include: { familyMembers: true },
    });
    return this.toFamilyGraph(updated);
  }

  async setHouseholdGroupCarrierFamily(
    clubId: string,
    input: SetHouseholdGroupCarrierInput,
  ): Promise<HouseholdGroupGraph> {
    const grp = await this.prisma.householdGroup.findFirst({
      where: { id: input.householdGroupId, clubId },
    });
    if (!grp) {
      throw new NotFoundException('Groupe foyer introuvable');
    }
    if (input.carrierFamilyId === undefined) {
      return {
        id: grp.id,
        clubId: grp.clubId,
        label: grp.label ?? null,
        carrierFamilyId: grp.carrierFamilyId ?? null,
      };
    }
    if (input.carrierFamilyId) {
      const fam = await this.prisma.family.findFirst({
        where: {
          id: input.carrierFamilyId,
          clubId,
          householdGroupId: grp.id,
        },
      });
      if (!fam) {
        throw new BadRequestException(
          'Le foyer porteur doit appartenir au même groupe foyer étendu',
        );
      }
    }
    const row = await this.prisma.householdGroup.update({
      where: { id: grp.id },
      data: { carrierFamilyId: input.carrierFamilyId },
    });
    return {
      id: row.id,
      clubId: row.clubId,
      label: row.label ?? null,
      carrierFamilyId: row.carrierFamilyId ?? null,
    };
  }
}
