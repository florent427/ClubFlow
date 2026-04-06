import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FamilyMemberLinkRole,
  MemberCivility,
  MemberClubRole,
  MemberStatus,
  Prisma,
} from '@prisma/client';
import { FamiliesService } from '../families/families.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertMemberEmailAllowedInClub,
  normalizeMemberEmail,
  resolveClubMemberEmailDuplicateForCreate,
} from './member-email-family-rule';
import { CreateClubRoleDefinitionInput } from './dto/create-club-role-definition.input';
import { CreateDynamicGroupInput } from './dto/create-dynamic-group.input';
import { CreateGradeLevelInput } from './dto/create-grade-level.input';
import { CreateMemberInput } from './dto/create-member.input';
import { UpdateClubRoleDefinitionInput } from './dto/update-club-role-definition.input';
import { UpdateDynamicGroupInput } from './dto/update-dynamic-group.input';
import { UpdateGradeLevelInput } from './dto/update-grade-level.input';
import { UpdateMemberInput } from './dto/update-member.input';
import { memberMatchesDynamicGroup } from './dynamic-group-matcher';
import {
  catalogFieldLabelFr,
  isCatalogFieldEmpty,
  normalizeCustomFieldValue,
} from './member-field-helpers';
import { MemberFieldConfigService } from './member-field-config.service';
import { ClubRoleDefinitionGraph } from './models/club-role-definition.model';
import { DynamicGroupGraph } from './models/dynamic-group.model';
import { GradeLevelGraph } from './models/grade-level.model';
import { ClubMemberFieldLayoutGraph } from './models/club-member-field-layout.model';
import { ClubMemberEmailDuplicateInfoGraph } from './models/club-member-email-duplicate-info.model';
import { MemberGraph } from './models/member.model';
import { MemberPseudoService } from '../messaging/member-pseudo.service';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fieldConfig: MemberFieldConfigService,
    private readonly families: FamiliesService,
    private readonly memberPseudo: MemberPseudoService,
  ) {}

  private assertMemberIdentityComplete(
    firstName: string,
    lastName: string,
    email: string,
    civility: MemberCivility | null | undefined,
  ): void {
    if (!firstName.trim() || !lastName.trim()) {
      throw new BadRequestException('Prénom et nom sont obligatoires.');
    }
    if (!email.trim()) {
      throw new BadRequestException('L’e-mail est obligatoire.');
    }
    if (
      civility !== MemberCivility.MR &&
      civility !== MemberCivility.MME
    ) {
      throw new BadRequestException(
        'La civilité est obligatoire (Mr ou Mme).',
      );
    }
  }

  private toGradeGraph(row: {
    id: string;
    clubId: string;
    label: string;
    sortOrder: number;
  }): GradeLevelGraph {
    return {
      id: row.id,
      clubId: row.clubId,
      label: row.label,
      sortOrder: row.sortOrder,
    };
  }

  private toClubRoleGraph(row: {
    id: string;
    clubId: string;
    label: string;
    sortOrder: number;
  }): ClubRoleDefinitionGraph {
    return {
      id: row.id,
      clubId: row.clubId,
      label: row.label,
      sortOrder: row.sortOrder,
    };
  }

  private memberIncludeGraph = {
    gradeLevel: true,
    roleAssignments: true,
    customRoleAssignments: { include: { roleDefinition: true } },
    familyMembers: { take: 1 as const, include: { family: true } },
    customFieldValues: { include: { definition: true } },
    dynamicGroupAssignments: {
      include: {
        dynamicGroup: { select: { id: true, name: true } },
      },
    },
  } as const;

  private async toMemberGraph(
    row: Prisma.MemberGetPayload<{
      include: {
        gradeLevel: true;
        roleAssignments: true;
        customRoleAssignments: { include: { roleDefinition: true } };
        familyMembers: { take: 1; include: { family: true } };
        customFieldValues: { include: { definition: true } };
        dynamicGroupAssignments: {
          include: {
            dynamicGroup: { select: { id: true; name: true } };
          };
        };
      };
    }>,
  ): Promise<MemberGraph> {
    const fm = row.familyMembers[0];
    const assignedDynamicGroups = [...row.dynamicGroupAssignments]
      .map((l) => ({
        id: l.dynamicGroup.id,
        name: l.dynamicGroup.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return {
      id: row.id,
      clubId: row.clubId,
      userId: row.userId,
      firstName: row.firstName,
      lastName: row.lastName,
      pseudo: row.pseudo,
      civility: row.civility,
      email: row.email,
      phone: row.phone,
      addressLine: row.addressLine,
      postalCode: row.postalCode,
      city: row.city,
      birthDate: row.birthDate,
      photoUrl: row.photoUrl,
      medicalCertExpiresAt: row.medicalCertExpiresAt,
      status: row.status,
      gradeLevelId: row.gradeLevelId,
      gradeLevel: row.gradeLevel ? this.toGradeGraph(row.gradeLevel) : null,
      roles: row.roleAssignments.map((a) => a.role),
      customRoles: row.customRoleAssignments.map((a) =>
        this.toClubRoleGraph(a.roleDefinition),
      ),
      family: fm
        ? { id: fm.family.id, label: fm.family.label }
        : null,
      familyLink: fm
        ? { id: fm.id, linkRole: fm.linkRole }
        : null,
      customFieldValues: row.customFieldValues
        .filter((v) => v.definition.archivedAt == null)
        .map((v) => ({
          id: v.id,
          definitionId: v.definitionId,
          valueText: v.valueText,
          definition: this.fieldConfig.toDefGraph(v.definition),
        })),
      assignedDynamicGroups,
      telegramLinked: Boolean(row.telegramChatId),
    };
  }

  private async assertMemberMatchesFieldRules(
    clubId: string,
    memberId: string,
  ): Promise<void> {
    const m = await this.prisma.member.findFirst({
      where: { id: memberId, clubId },
    });
    if (!m) {
      return;
    }
    const catalog = await this.fieldConfig.getCatalogSettingsMap(clubId);
    for (const [key, { required, showOnForm }] of catalog) {
      if (showOnForm && required && isCatalogFieldEmpty(key, m)) {
        throw new BadRequestException(
          `Champ obligatoire manquant : ${catalogFieldLabelFr(key)}`,
        );
      }
    }
    const defs = await this.fieldConfig.getActiveCustomDefinitions(clubId);
    const vals = await this.prisma.memberCustomFieldValue.findMany({
      where: { memberId },
    });
    const byDef = new Map(vals.map((v) => [v.definitionId, v.valueText]));
    for (const d of defs) {
      if (!d.required) {
        continue;
      }
      const v = byDef.get(d.id);
      if (v === undefined || v === null || String(v).trim() === '') {
        throw new BadRequestException(
          `Champ obligatoire manquant : ${d.label}`,
        );
      }
    }
  }

  async getMemberFieldLayout(
    clubId: string,
  ): Promise<ClubMemberFieldLayoutGraph> {
    const [catalogSettings, customFieldDefinitions] = await Promise.all([
      this.fieldConfig.listCatalogSettings(clubId),
      this.fieldConfig.listCustomFieldDefinitions(clubId),
    ]);
    return { catalogSettings, customFieldDefinitions };
  }

  async listGradeLevels(clubId: string): Promise<GradeLevelGraph[]> {
    const rows = await this.prisma.gradeLevel.findMany({
      where: { clubId },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map((r) => this.toGradeGraph(r));
  }

  async createGradeLevel(
    clubId: string,
    input: CreateGradeLevelInput,
  ): Promise<GradeLevelGraph> {
    const row = await this.prisma.gradeLevel.create({
      data: {
        clubId,
        label: input.label,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    return this.toGradeGraph(row);
  }

  async updateGradeLevel(
    clubId: string,
    input: UpdateGradeLevelInput,
  ): Promise<GradeLevelGraph> {
    const existing = await this.prisma.gradeLevel.findFirst({
      where: { id: input.id, clubId },
    });
    if (!existing) {
      throw new NotFoundException('Grade introuvable');
    }
    const row = await this.prisma.gradeLevel.update({
      where: { id: input.id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    return this.toGradeGraph(row);
  }

  async deleteGradeLevel(clubId: string, id: string): Promise<void> {
    const existing = await this.prisma.gradeLevel.findFirst({
      where: { id, clubId },
      include: {
        _count: { select: { members: true, dynamicGroupGradeLevels: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Grade introuvable');
    }
    if (
      existing._count.members > 0 ||
      existing._count.dynamicGroupGradeLevels > 0
    ) {
      throw new BadRequestException(
        'Impossible de supprimer ce grade : membres ou groupes dynamiques y font encore référence',
      );
    }
    await this.prisma.gradeLevel.delete({ where: { id } });
  }

  async listClubRoleDefinitions(
    clubId: string,
  ): Promise<ClubRoleDefinitionGraph[]> {
    const rows = await this.prisma.clubRoleDefinition.findMany({
      where: { clubId },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map((r) => this.toClubRoleGraph(r));
  }

  async createClubRoleDefinition(
    clubId: string,
    input: CreateClubRoleDefinitionInput,
  ): Promise<ClubRoleDefinitionGraph> {
    const row = await this.prisma.clubRoleDefinition.create({
      data: {
        clubId,
        label: input.label,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    return this.toClubRoleGraph(row);
  }

  async updateClubRoleDefinition(
    clubId: string,
    input: UpdateClubRoleDefinitionInput,
  ): Promise<ClubRoleDefinitionGraph> {
    const existing = await this.prisma.clubRoleDefinition.findFirst({
      where: { id: input.id, clubId },
    });
    if (!existing) {
      throw new NotFoundException('Rôle personnalisé introuvable');
    }
    const row = await this.prisma.clubRoleDefinition.update({
      where: { id: input.id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    return this.toClubRoleGraph(row);
  }

  async deleteClubRoleDefinition(clubId: string, id: string): Promise<void> {
    const existing = await this.prisma.clubRoleDefinition.findFirst({
      where: { id, clubId },
      include: {
        _count: { select: { assignments: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Rôle personnalisé introuvable');
    }
    if (existing._count.assignments > 0) {
      throw new BadRequestException(
        'Impossible de supprimer ce rôle : des membres y sont encore affectés',
      );
    }
    await this.prisma.clubRoleDefinition.delete({ where: { id } });
  }

  async listMembers(clubId: string): Promise<MemberGraph[]> {
    const rows = await this.prisma.member.findMany({
      where: { clubId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: this.memberIncludeGraph,
    });
    const ids = rows.map((r) => r.id);
    const tgRows =
      ids.length === 0
        ? []
        : await this.prisma.member.findMany({
            where: { clubId, id: { in: ids } },
            select: { id: true, telegramChatId: true },
          });
    const tgById = new Map(tgRows.map((r) => [r.id, r.telegramChatId]));
    return Promise.all(
      rows.map(async (r) => {
        const g = await this.toMemberGraph(r);
        g.telegramLinked = Boolean(tgById.get(r.id));
        return g;
      }),
    );
  }

  async getMember(clubId: string, id: string): Promise<MemberGraph> {
    const row = await this.prisma.member.findFirst({
      where: { id, clubId },
      include: this.memberIncludeGraph,
    });
    if (!row) {
      throw new NotFoundException('Membre introuvable');
    }
    const g = await this.toMemberGraph(row);
    const tg = await this.prisma.member.findUnique({
      where: { id },
      select: { telegramChatId: true },
    });
    g.telegramLinked = Boolean(tg?.telegramChatId);
    return g;
  }

  private async assertGradeInClub(
    clubId: string,
    gradeLevelId: string,
  ): Promise<void> {
    const g = await this.prisma.gradeLevel.findFirst({
      where: { id: gradeLevelId, clubId },
    });
    if (!g) {
      throw new BadRequestException('Grade inconnu pour ce club');
    }
  }

  private async assertCustomRoleIdsInClub(
    clubId: string,
    ids: string[],
  ): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const found = await this.prisma.clubRoleDefinition.findMany({
      where: { clubId, id: { in: ids } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException(
        'Un ou plusieurs rôles personnalisés sont inconnus pour ce club',
      );
    }
  }

  private async assertUserLinkable(
    clubId: string,
    userId: string,
    excludeMemberId?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('Utilisateur inconnu');
    }
    const clash = await this.prisma.member.findFirst({
      where: {
        clubId,
        userId,
        ...(excludeMemberId ? { NOT: { id: excludeMemberId } } : {}),
      },
    });
    if (clash) {
      throw new BadRequestException(
        'Ce compte est déjà lié à un autre membre du club',
      );
    }
  }

  async getClubMemberEmailDuplicateInfo(
    clubId: string,
    email: string,
  ): Promise<ClubMemberEmailDuplicateInfoGraph> {
    const trimmed = email.trim();
    const empty: ClubMemberEmailDuplicateInfoGraph = {
      isClear: true,
      suggestedFamilyId: null,
      familyLabel: null,
      sharedEmail: null,
      existingMemberLabels: null,
      blockedMessage: null,
    };
    if (!trimmed) {
      return empty;
    }
    const r = await resolveClubMemberEmailDuplicateForCreate(
      this.prisma,
      clubId,
      trimmed,
    );
    if (r.kind === 'clear') {
      return empty;
    }
    if (r.kind === 'blocked') {
      return {
        isClear: false,
        suggestedFamilyId: null,
        familyLabel: null,
        sharedEmail: normalizeMemberEmail(trimmed) || trimmed,
        existingMemberLabels: null,
        blockedMessage: r.message,
      };
    }
    const fam = await this.prisma.family.findFirst({
      where: { id: r.familyId, clubId },
      select: { label: true },
    });
    return {
      isClear: false,
      suggestedFamilyId: r.familyId,
      familyLabel: fam?.label ?? null,
      sharedEmail: r.sharedEmail,
      existingMemberLabels: r.existingMembers.map(
        (m) => `${m.firstName} ${m.lastName}`.trim(),
      ),
      blockedMessage: null,
    };
  }

  async createMember(
    clubId: string,
    input: CreateMemberInput,
  ): Promise<MemberGraph> {
    if (input.gradeLevelId) {
      await this.assertGradeInClub(clubId, input.gradeLevelId);
    }
    if (input.userId) {
      await this.assertUserLinkable(clubId, input.userId);
    }
    if (input.customRoleIds?.length) {
      await this.assertCustomRoleIdsInClub(clubId, input.customRoleIds);
    }
    if (input.familyId) {
      const fam = await this.prisma.family.findFirst({
        where: { id: input.familyId, clubId },
        select: { id: true },
      });
      if (!fam) {
        throw new BadRequestException('Foyer introuvable');
      }
    }
    const emailTrimmed = input.email.trim();
    this.assertMemberIdentityComplete(
      input.firstName,
      input.lastName,
      emailTrimmed,
      input.civility,
    );
    await assertMemberEmailAllowedInClub(this.prisma, clubId, emailTrimmed, {
      memberId: null,
      assumeMemberFamilyId:
        input.familyId !== undefined && input.familyId !== null
          ? input.familyId
          : undefined,
    });
    const roles =
      input.roles && input.roles.length > 0
        ? input.roles
        : [MemberClubRole.STUDENT];
    const row = await this.prisma.$transaction(async (tx) => {
      const pseudo = await this.memberPseudo.pickAvailablePseudo(
        tx,
        clubId,
        input.firstName,
        input.lastName,
        null,
      );
      const created = await tx.member.create({
        data: {
          clubId,
          firstName: input.firstName,
          lastName: input.lastName,
          pseudo,
          civility: input.civility,
          email: emailTrimmed,
          phone: input.phone ?? null,
          addressLine: input.addressLine ?? null,
          postalCode: input.postalCode ?? null,
          city: input.city ?? null,
          birthDate: input.birthDate ? new Date(input.birthDate) : null,
          photoUrl: input.photoUrl ?? null,
          medicalCertExpiresAt: input.medicalCertExpiresAt
            ? new Date(input.medicalCertExpiresAt)
            : null,
          gradeLevelId: input.gradeLevelId ?? null,
          userId: input.userId ?? null,
          roleAssignments: {
            create: roles.map((role) => ({ role })),
          },
          customRoleAssignments:
            input.customRoleIds && input.customRoleIds.length > 0
              ? {
                  create: input.customRoleIds.map((roleDefinitionId) => ({
                    roleDefinitionId,
                  })),
                }
              : undefined,
        },
      });
      if (input.customFieldValues && input.customFieldValues.length > 0) {
        const defIds = [
          ...new Set(input.customFieldValues.map((c) => c.definitionId)),
        ];
        const defs = await tx.memberCustomFieldDefinition.findMany({
          where: { clubId, archivedAt: null, id: { in: defIds } },
        });
        if (defs.length !== defIds.length) {
          throw new BadRequestException(
            'Un ou plusieurs champs personnalisés sont inconnus pour ce club',
          );
        }
        const defById = new Map(defs.map((d) => [d.id, d]));
        for (const cv of input.customFieldValues) {
          const def = defById.get(cv.definitionId)!;
          const normalized = normalizeCustomFieldValue(def, cv.value);
          if (normalized !== null) {
            await tx.memberCustomFieldValue.create({
              data: {
                memberId: created.id,
                definitionId: cv.definitionId,
                valueText: normalized,
              },
            });
          }
        }
      }
      return tx.member.findFirstOrThrow({
        where: { id: created.id },
        include: this.memberIncludeGraph,
      });
    });
    if (input.familyId) {
      await this.families.transferClubMemberToFamily(
        clubId,
        row.id,
        input.familyId,
        FamilyMemberLinkRole.MEMBER,
      );
    }
    if (input.userId) {
      await this.families.migrateContactPayerLinksToMember(
        clubId,
        input.userId,
        row.id,
      );
    }
    await this.families.syncContactUserPayerMemberLinksByEmail(
      clubId,
      emailTrimmed,
    );
    await this.assertMemberMatchesFieldRules(clubId, row.id);
    return this.toMemberGraph(row);
  }

  async updateMember(
    clubId: string,
    input: UpdateMemberInput,
  ): Promise<MemberGraph> {
    const existing = await this.prisma.member.findFirst({
      where: { id: input.id, clubId },
    });
    if (!existing) {
      throw new NotFoundException('Membre introuvable');
    }
    if (input.gradeLevelId) {
      await this.assertGradeInClub(clubId, input.gradeLevelId);
    }
    if (input.userId !== undefined && input.userId !== null) {
      await this.assertUserLinkable(clubId, input.userId, input.id);
    }
    if (input.roles !== undefined && input.roles.length === 0) {
      throw new BadRequestException(
        'Un membre doit avoir au moins un rôle métier',
      );
    }
    if (input.customRoleIds !== undefined && input.customRoleIds.length > 0) {
      await this.assertCustomRoleIdsInClub(clubId, input.customRoleIds);
    }

    const firstName =
      input.firstName !== undefined ? input.firstName : existing.firstName;
    const lastName =
      input.lastName !== undefined ? input.lastName : existing.lastName;
    const email =
      input.email !== undefined
        ? input.email.trim()
        : existing.email.trim();
    if (input.civility === null) {
      throw new BadRequestException(
        'La civilité est obligatoire (Mr ou Mme).',
      );
    }
    const civility =
      input.civility !== undefined ? input.civility : existing.civility;
    this.assertMemberIdentityComplete(firstName, lastName, email, civility);

    if (input.email !== undefined) {
      await assertMemberEmailAllowedInClub(this.prisma, clubId, email, {
        memberId: input.id,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const patch: Prisma.MemberUncheckedUpdateInput = {};
      if (input.firstName !== undefined) patch.firstName = input.firstName;
      if (input.lastName !== undefined) patch.lastName = input.lastName;
      if (input.civility !== undefined && input.civility !== null) {
        patch.civility = input.civility;
      }
      if (input.email !== undefined) patch.email = input.email.trim();
      if (input.phone !== undefined) patch.phone = input.phone;
      if (input.addressLine !== undefined) patch.addressLine = input.addressLine;
      if (input.postalCode !== undefined) patch.postalCode = input.postalCode;
      if (input.city !== undefined) patch.city = input.city;
      if (input.birthDate !== undefined) {
        patch.birthDate = input.birthDate
          ? new Date(input.birthDate as string)
          : null;
      }
      if (input.photoUrl !== undefined) patch.photoUrl = input.photoUrl;
      if (input.medicalCertExpiresAt !== undefined) {
        patch.medicalCertExpiresAt = input.medicalCertExpiresAt
          ? new Date(input.medicalCertExpiresAt)
          : null;
      }
      if (input.gradeLevelId !== undefined) {
        patch.gradeLevelId = input.gradeLevelId;
      }
      if (input.userId !== undefined) {
        patch.userId = input.userId;
      }
      await tx.member.update({
        where: { id: input.id },
        data: patch,
      });
      if (input.roles !== undefined) {
        await tx.memberRoleAssignment.deleteMany({
          where: { memberId: input.id },
        });
        await tx.memberRoleAssignment.createMany({
          data: input.roles.map((role) => ({
            memberId: input.id,
            role,
          })),
        });
      }
      if (input.customRoleIds !== undefined) {
        await tx.memberCustomRoleAssignment.deleteMany({
          where: { memberId: input.id },
        });
        if (input.customRoleIds.length > 0) {
          await tx.memberCustomRoleAssignment.createMany({
            data: input.customRoleIds.map((roleDefinitionId) => ({
              memberId: input.id,
              roleDefinitionId,
            })),
          });
        }
      }
      if (input.customFieldValues !== undefined) {
        const defIds = [
          ...new Set(input.customFieldValues.map((c) => c.definitionId)),
        ];
        const defs = await tx.memberCustomFieldDefinition.findMany({
          where: { clubId, archivedAt: null, id: { in: defIds } },
        });
        if (defs.length !== defIds.length) {
          throw new BadRequestException(
            'Un ou plusieurs champs personnalisés sont inconnus pour ce club',
          );
        }
        const defById = new Map(defs.map((d) => [d.id, d]));
        for (const cv of input.customFieldValues) {
          const def = defById.get(cv.definitionId)!;
          const normalized = normalizeCustomFieldValue(def, cv.value);
          if (normalized === null) {
            await tx.memberCustomFieldValue.deleteMany({
              where: {
                memberId: input.id,
                definitionId: cv.definitionId,
              },
            });
          } else {
            await tx.memberCustomFieldValue.upsert({
              where: {
                memberId_definitionId: {
                  memberId: input.id,
                  definitionId: cv.definitionId,
                },
              },
              create: {
                memberId: input.id,
                definitionId: cv.definitionId,
                valueText: normalized,
              },
              update: { valueText: normalized },
            });
          }
        }
      }
    });

    if (input.userId !== undefined && input.userId !== null) {
      await this.families.migrateContactPayerLinksToMember(
        clubId,
        input.userId,
        input.id,
      );
    }
    await this.families.syncContactUserPayerMemberLinksByEmail(clubId, email);
    await this.assertMemberMatchesFieldRules(clubId, input.id);
    return this.getMember(clubId, input.id);
  }

  async deleteMember(clubId: string, id: string): Promise<void> {
    const existing = await this.prisma.member.findFirst({
      where: { id, clubId },
    });
    if (!existing) {
      throw new NotFoundException('Membre introuvable');
    }
    const coachSlots = await this.prisma.courseSlot.count({
      where: { clubId, coachMemberId: id },
    });
    if (coachSlots > 0) {
      throw new BadRequestException(
        'Impossible de supprimer ce membre : il est encore professeur sur un ou plusieurs créneaux',
      );
    }
    const priorFamilyLink = await this.prisma.familyMember.findFirst({
      where: { memberId: id },
      select: { familyId: true },
    });
    await this.prisma.member.delete({ where: { id } });
    if (priorFamilyLink) {
      await this.families.ensureSoleFamilyMemberIsPayer(
        priorFamilyLink.familyId,
      );
      await this.families.syncContactLinksForFamilyMemberEmails(
        clubId,
        priorFamilyLink.familyId,
      );
    }
  }

  async setMemberStatus(
    clubId: string,
    memberId: string,
    status: MemberStatus,
  ): Promise<MemberGraph> {
    const existing = await this.prisma.member.findFirst({
      where: { id: memberId, clubId },
    });
    if (!existing) {
      throw new NotFoundException('Membre introuvable');
    }
    await this.prisma.member.update({
      where: { id: memberId },
      data: { status },
    });
    return this.getMember(clubId, memberId);
  }

  private criteriaFromGroup(group: {
    minAge: number | null;
    maxAge: number | null;
    gradeFilters: { gradeLevelId: string }[];
  }) {
    return {
      minAge: group.minAge,
      maxAge: group.maxAge,
      gradeLevelIds: group.gradeFilters.map((g) => g.gradeLevelId),
    };
  }

  private dynamicGroupSpecificity(g: {
    minAge: number | null;
    maxAge: number | null;
    gradeFilters: { gradeLevelId: string }[];
  }): number {
    return g.gradeFilters.length * 10 + (g.minAge != null || g.maxAge != null ? 5 : 0);
  }

  async suggestDynamicGroupsForMember(
    clubId: string,
    memberId: string,
  ): Promise<DynamicGroupGraph[]> {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, clubId },
    });
    if (!member) {
      throw new NotFoundException('Membre introuvable');
    }
    const groups = await this.prisma.dynamicGroup.findMany({
      where: { clubId },
      include: { gradeFilters: { include: { gradeLevel: true } } },
    });
    const ref = new Date();
    const matched = groups.filter((g) =>
      memberMatchesDynamicGroup(
        {
          status: member.status,
          birthDate: member.birthDate,
          gradeLevelId: member.gradeLevelId,
        },
        this.criteriaFromGroup(g),
        ref,
      ),
    );
    matched.sort(
      (a, b) => this.dynamicGroupSpecificity(b) - this.dynamicGroupSpecificity(a),
    );
    const out: DynamicGroupGraph[] = [];
    for (const r of matched) {
      const matchingActiveMembersCount = await this.countMatchingMembers(
        clubId,
        r,
      );
      out.push({
        id: r.id,
        clubId: r.clubId,
        name: r.name,
        minAge: r.minAge,
        maxAge: r.maxAge,
        gradeFilters: r.gradeFilters.map((gf) => this.toGradeGraph(gf.gradeLevel)),
        matchingActiveMembersCount,
      });
    }
    return out;
  }

  async setMemberDynamicGroupAssignments(
    clubId: string,
    memberId: string,
    dynamicGroupIds: string[],
  ): Promise<void> {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, clubId },
    });
    if (!member) {
      throw new NotFoundException('Membre introuvable');
    }
    const uniq = [...new Set(dynamicGroupIds)];
    for (const gid of uniq) {
      const g = await this.prisma.dynamicGroup.findFirst({
        where: { id: gid, clubId },
      });
      if (!g) {
        throw new BadRequestException(`Groupe dynamique inconnu : ${gid}`);
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.memberDynamicGroup.deleteMany({ where: { memberId, clubId } });
      if (uniq.length > 0) {
        await tx.memberDynamicGroup.createMany({
          data: uniq.map((dynamicGroupId) => ({
            clubId,
            memberId,
            dynamicGroupId,
          })),
        });
      }
    });
  }

  async countMatchingMembers(
    clubId: string,
    group: {
      minAge: number | null;
      maxAge: number | null;
      gradeFilters: { gradeLevelId: string }[];
    },
  ): Promise<number> {
    const criteria = this.criteriaFromGroup(group);
    const members = await this.prisma.member.findMany({
      where: { clubId, status: MemberStatus.ACTIVE },
    });
    const ref = new Date();
    return members.filter((m) =>
      memberMatchesDynamicGroup(
        {
          status: m.status,
          birthDate: m.birthDate,
          gradeLevelId: m.gradeLevelId,
        },
        criteria,
        ref,
      ),
    ).length;
  }

  async listDynamicGroups(clubId: string): Promise<DynamicGroupGraph[]> {
    const rows = await this.prisma.dynamicGroup.findMany({
      where: { clubId },
      orderBy: { name: 'asc' },
      include: {
        gradeFilters: { include: { gradeLevel: true } },
      },
    });
    const out: DynamicGroupGraph[] = [];
    for (const r of rows) {
      const matchingActiveMembersCount = await this.countMatchingMembers(
        clubId,
        r,
      );
      out.push({
        id: r.id,
        clubId: r.clubId,
        name: r.name,
        minAge: r.minAge,
        maxAge: r.maxAge,
        gradeFilters: r.gradeFilters.map((gf) => this.toGradeGraph(gf.gradeLevel)),
        matchingActiveMembersCount,
      });
    }
    return out;
  }

  async createDynamicGroup(
    clubId: string,
    input: CreateDynamicGroupInput,
  ): Promise<DynamicGroupGraph> {
    const gradeIds = input.gradeLevelIds ?? [];
    for (const gid of gradeIds) {
      await this.assertGradeInClub(clubId, gid);
    }
    const row = await this.prisma.dynamicGroup.create({
      data: {
        clubId,
        name: input.name,
        minAge: input.minAge ?? null,
        maxAge: input.maxAge ?? null,
        gradeFilters:
          gradeIds.length > 0
            ? { create: gradeIds.map((gradeLevelId) => ({ gradeLevelId })) }
            : undefined,
      },
      include: { gradeFilters: { include: { gradeLevel: true } } },
    });
    const matchingActiveMembersCount = await this.countMatchingMembers(
      clubId,
      row,
    );
    return {
      id: row.id,
      clubId: row.clubId,
      name: row.name,
      minAge: row.minAge,
      maxAge: row.maxAge,
      gradeFilters: row.gradeFilters.map((gf) =>
        this.toGradeGraph(gf.gradeLevel),
      ),
      matchingActiveMembersCount,
    };
  }

  async updateDynamicGroup(
    clubId: string,
    input: UpdateDynamicGroupInput,
  ): Promise<DynamicGroupGraph> {
    const existing = await this.prisma.dynamicGroup.findFirst({
      where: { id: input.id, clubId },
      include: { gradeFilters: true },
    });
    if (!existing) {
      throw new NotFoundException('Groupe dynamique introuvable');
    }
    if (input.gradeLevelIds !== undefined) {
      for (const gid of input.gradeLevelIds) {
        await this.assertGradeInClub(clubId, gid);
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.dynamicGroup.update({
        where: { id: input.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.minAge !== undefined ? { minAge: input.minAge } : {}),
          ...(input.maxAge !== undefined ? { maxAge: input.maxAge } : {}),
        },
      });
      if (input.gradeLevelIds !== undefined) {
        await tx.dynamicGroupGradeLevel.deleteMany({
          where: { dynamicGroupId: input.id },
        });
        if (input.gradeLevelIds.length > 0) {
          await tx.dynamicGroupGradeLevel.createMany({
            data: input.gradeLevelIds.map((gradeLevelId) => ({
              dynamicGroupId: input.id,
              gradeLevelId,
            })),
          });
        }
      }
    });
    const row = await this.prisma.dynamicGroup.findFirstOrThrow({
      where: { id: input.id, clubId },
      include: { gradeFilters: { include: { gradeLevel: true } } },
    });
    const matchingActiveMembersCount = await this.countMatchingMembers(
      clubId,
      row,
    );
    return {
      id: row.id,
      clubId: row.clubId,
      name: row.name,
      minAge: row.minAge,
      maxAge: row.maxAge,
      gradeFilters: row.gradeFilters.map((gf) =>
        this.toGradeGraph(gf.gradeLevel),
      ),
      matchingActiveMembersCount,
    };
  }

  /**
   * Ancien schéma : `MembershipProduct.dynamicGroupId`. Absent après migration dual tarif.
   */
  private async countLegacyMembershipProductsForGroup(
    clubId: string,
    dynamicGroupId: string,
  ): Promise<number> {
    try {
      const cols = await this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*)::bigint AS n
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'MembershipProduct'
          AND column_name = 'dynamicGroupId'
      `;
      if (Number(cols[0]?.n ?? 0) === 0) {
        return 0;
      }
      const r = await this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*)::bigint AS n
        FROM "MembershipProduct"
        WHERE "clubId" = ${clubId} AND "dynamicGroupId" = ${dynamicGroupId}
      `;
      return Number(r[0]?.n ?? 0);
    } catch {
      return 0;
    }
  }

  async deleteDynamicGroup(clubId: string, id: string): Promise<void> {
    const existing = await this.prisma.dynamicGroup.findFirst({
      where: { id, clubId },
    });
    if (!existing) {
      throw new NotFoundException('Groupe dynamique introuvable');
    }

    const legacyLinked = await this.countLegacyMembershipProductsForGroup(
      clubId,
      id,
    );
    if (legacyLinked > 0) {
      throw new BadRequestException(
        `${legacyLinked} formule(s) d’adhésion référencent encore ce groupe (ancien modèle « groupe tarifaire »). ` +
          `Dans le dossier apps/api, exécutez « npx prisma migrate deploy » (ou « migrate dev » en local), ` +
          `puis redémarrez l’API. Sinon, supprimez ou modifiez ces formules directement en base.`,
      );
    }

    try {
      await this.prisma.dynamicGroup.delete({ where: { id } });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        const meta = e.meta as
          | { constraint?: string; field_name?: string }
          | undefined;
        const c = `${meta?.constraint ?? ''} ${meta?.field_name ?? ''}`;
        if (c.includes('MembershipProduct') && c.includes('dynamicGroup')) {
          throw new BadRequestException(
            'La base est encore sur l’ancien lien formule ↔ groupe dynamique. ' +
              'Exécutez « npx prisma migrate deploy » dans apps/api (migration dual tarif / suppression de dynamicGroupId sur les formules), puis réessayez.',
          );
        }
      }
      throw e;
    }
  }
}
