import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FamilyMemberLinkRole,
  InvoiceStatus,
  MemberCivility,
  MemberClubRole,
  MemberStatus,
  type Prisma,
} from '@prisma/client';
import { FamiliesService } from '../families/families.service';
import { ClubContactsService } from '../members/club-contacts.service';
import {
  assertMemberEmailAllowedInClub,
  normalizeMemberEmail,
} from '../members/member-email-family-rule';
import { resolveAdminWorkspaceClubId } from '../common/club-back-office-role';
import { buildInvoiceWhereForHouseholdGroup } from '../families/household-billing.scope';
import {
  isStrictlyMinorProfile,
  shouldIncludeMemberInHouseholdViewerProfiles,
} from '../families/viewer-profile-rules';
import { invoicePaymentTotals } from '../payments/invoice-totals';
import { PlanningService } from '../planning/planning.service';
import { PrismaService } from '../prisma/prisma.service';
import { ViewerCourseSlotGraph } from './models/viewer-course-slot.model';
import { ViewerFamilyBillingSummaryGraph } from './models/viewer-family-billing.model';
import { ViewerInvoicePaymentSnippetGraph } from './models/viewer-invoice-payment-snippet.model';
import { ViewerLinkedHouseholdFamilyGraph } from './models/viewer-linked-household-family.model';
import { ViewerFamilyJoinResultGraph } from './models/viewer-family-join-result.model';
import { ViewerMemberGraph } from './models/viewer-member.model';
import { MemberPseudoService } from '../messaging/member-pseudo.service';

@Injectable()
export class ViewerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planning: PlanningService,
    private readonly families: FamiliesService,
    private readonly memberPseudo: MemberPseudoService,
    private readonly clubContacts: ClubContactsService,
  ) {}

  async viewerMe(
    clubId: string,
    memberId: string,
    userId: string,
  ): Promise<ViewerMemberGraph> {
    const m = await this.prisma.member.findFirst({
      where: { id: memberId, clubId, status: MemberStatus.ACTIVE },
      include: { gradeLevel: true },
    });
    if (!m) {
      throw new NotFoundException('Membre introuvable');
    }
    const adminWorkspaceClubId = await resolveAdminWorkspaceClubId(
      this.prisma,
      userId,
      clubId,
    );
    const canAccessClubBackOffice = adminWorkspaceClubId !== null;
    const familyLink = await this.prisma.familyMember.findFirst({
      where: { memberId, family: { clubId } },
      select: { familyId: true },
    });
    const hasClubFamily = familyLink != null;
    return {
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      pseudo: m.pseudo,
      photoUrl: m.photoUrl,
      civility: m.civility,
      medicalCertExpiresAt: m.medicalCertExpiresAt,
      gradeLevelId: m.gradeLevelId,
      gradeLevelLabel: m.gradeLevel?.label ?? null,
      canAccessClubBackOffice,
      adminWorkspaceClubId,
      hasClubFamily,
      canSelfAttachFamilyViaPayerEmail: !hasClubFamily,
      isContactProfile: false,
      hideMemberModules: false,
      telegramLinked: Boolean(m.telegramChatId),
    };
  }

  async updateMyPseudo(
    clubId: string,
    memberId: string,
    userId: string,
    pseudoRaw: string,
  ): Promise<ViewerMemberGraph> {
    await this.memberPseudo.updatePseudoForMember(
      clubId,
      memberId,
      pseudoRaw,
    );
    return this.viewerMe(clubId, memberId, userId);
  }

  async viewerMeAsContact(
    clubId: string,
    contactId: string,
    userId: string,
  ): Promise<ViewerMemberGraph> {
    const c = await this.prisma.contact.findFirst({
      where: { id: contactId, clubId, userId },
    });
    if (!c) {
      throw new NotFoundException('Profil introuvable');
    }
    const adminWorkspaceClubId = await resolveAdminWorkspaceClubId(
      this.prisma,
      userId,
      clubId,
    );
    const canAccessClubBackOffice = adminWorkspaceClubId !== null;
    const payerLink = await this.prisma.familyMember.findFirst({
      where: {
        contactId,
        linkRole: FamilyMemberLinkRole.PAYER,
        family: { clubId },
      },
      select: { familyId: true },
    });
    const hasClubFamily = payerLink != null;
    return {
      id: contactId,
      firstName: c.firstName,
      lastName: c.lastName,
      pseudo: null,
      photoUrl: null,
      civility: MemberCivility.MR,
      medicalCertExpiresAt: null,
      gradeLevelId: null,
      gradeLevelLabel: null,
      canAccessClubBackOffice,
      adminWorkspaceClubId,
      hasClubFamily,
      canSelfAttachFamilyViaPayerEmail: !hasClubFamily,
      isContactProfile: true,
      hideMemberModules: true,
      telegramLinked: false,
    };
  }

  /**
   * Foyer dont le « contact principal » est identifié par cette e-mail :
   * membre avec rôle PAYER, ou seul membre du foyer (payeur implicite).
   */
  private async findFamilyByPrincipalPayerEmail(
    clubId: string,
    payerEmailRaw: string,
  ): Promise<{ familyId: string } | null> {
    const norm = normalizeMemberEmail(payerEmailRaw);
    if (!norm) {
      return null;
    }
    const members = await this.prisma.member.findMany({
      where: { clubId, status: MemberStatus.ACTIVE },
      select: { id: true, email: true },
    });
    const payerCandidates = members.filter(
      (x) => normalizeMemberEmail(x.email) === norm,
    );
    for (const m of payerCandidates) {
      const fmLinks = await this.prisma.familyMember.findMany({
        where: { memberId: m.id },
        include: { family: { select: { clubId: true } } },
      });
      for (const l of fmLinks) {
        if (l.family.clubId !== clubId) continue;
        const count = await this.prisma.familyMember.count({
          where: { familyId: l.familyId },
        });
        if (count === 1 || l.linkRole === FamilyMemberLinkRole.PAYER) {
          return { familyId: l.familyId };
        }
      }
    }
    const contacts = await this.prisma.contact.findMany({
      where: {
        clubId,
        user: { email: { equals: norm, mode: 'insensitive' } },
      },
      select: { id: true },
    });
    for (const c of contacts) {
      const payFm = await this.prisma.familyMember.findFirst({
        where: {
          contactId: c.id,
          linkRole: FamilyMemberLinkRole.PAYER,
          family: { clubId },
        },
      });
      if (payFm) {
        return { familyId: payFm.familyId };
      }
    }
    return null;
  }

  async viewerJoinFamilyByPayerEmail(
    clubId: string,
    memberId: string,
    payerEmail: string,
  ): Promise<ViewerFamilyJoinResultGraph> {
    const subject = await this.prisma.member.findFirst({
      where: { id: memberId, clubId, status: MemberStatus.ACTIVE },
    });
    if (!subject) {
      throw new NotFoundException('Membre introuvable');
    }

    const existingLink = await this.prisma.familyMember.findFirst({
      where: { memberId, family: { clubId } },
      select: { familyId: true },
    });
    if (existingLink) {
      throw new BadRequestException(
        'Vous êtes déjà rattaché à un foyer. Contactez le club pour modifier ce rattachement.',
      );
    }

    const target = await this.findFamilyByPrincipalPayerEmail(
      clubId,
      payerEmail,
    );
    if (!target) {
      throw new BadRequestException(
        "Aucun foyer dont le payeur correspond à cette e-mail n'a été trouvé. Vérifiez l'adresse (telle qu'enregistrée au club) ou contactez le secrétariat.",
      );
    }

    const linked = await this.families.linkMemberAsCoParentResidenceFromPayerFamily(
      clubId,
      memberId,
      target.familyId,
    );

    const fam = await this.prisma.family.findFirst({
      where: { id: linked.newFamilyId, clubId },
      select: { label: true },
    });

    return {
      success: true,
      message:
        'Votre foyer « résidence » a été créé dans l’espace familial partagé avec celui du payeur. Vous n’apparaissez pas dans son foyer au club ; vous partagez les factures et les enfants du groupe sur le portail. Actualisez la page.',
      familyId: linked.newFamilyId,
      familyLabel: fam?.label ?? null,
    };
  }

  async contactJoinFamilyByPayerEmail(
    clubId: string,
    contactId: string,
    userId: string,
    payerEmail: string,
  ): Promise<ViewerFamilyJoinResultGraph> {
    const subject = await this.prisma.contact.findFirst({
      where: { id: contactId, clubId, userId },
    });
    if (!subject) {
      throw new NotFoundException('Profil introuvable');
    }

    const existingPayerLink = await this.prisma.familyMember.findFirst({
      where: {
        contactId,
        linkRole: FamilyMemberLinkRole.PAYER,
        family: { clubId },
      },
      select: { familyId: true },
    });
    if (existingPayerLink) {
      throw new BadRequestException(
        'Vous êtes déjà rattaché à un foyer. Contactez le club pour modifier ce rattachement.',
      );
    }

    const target = await this.findFamilyByPrincipalPayerEmail(
      clubId,
      payerEmail,
    );
    if (!target) {
      throw new BadRequestException(
        "Aucun foyer dont le payeur correspond à cette e-mail n'a été trouvé. Vérifiez l'adresse (telle qu'enregistrée au club) ou contactez le secrétariat.",
      );
    }

    const linked =
      await this.families.linkContactAsCoParentResidenceFromPayerFamily(
        clubId,
        contactId,
        target.familyId,
      );

    const fam = await this.prisma.family.findFirst({
      where: { id: linked.newFamilyId, clubId },
      select: { label: true },
    });

    return {
      success: true,
      message:
        'Votre espace contact est rattaché à l’espace familial partagé avec celui du payeur. Vous partagez les factures et les enfants du groupe sur le portail. Actualisez la page.',
      familyId: linked.newFamilyId,
      familyLabel: fam?.label ?? null,
    };
  }

  async viewerUpcomingCourseSlots(
    clubId: string,
    memberId: string,
  ): Promise<ViewerCourseSlotGraph[]> {
    const rows =
      await this.planning.listUpcomingCourseSlotsForViewerMember(
        clubId,
        memberId,
      );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      venueName: r.venue.name,
      coachFirstName: r.coachMember.firstName,
      coachLastName: r.coachMember.lastName,
    }));
  }

  async viewerFamilyBillingSummary(
    clubId: string,
    memberId: string,
    viewerUserId: string,
  ): Promise<ViewerFamilyBillingSummaryGraph> {
    const empty: ViewerFamilyBillingSummaryGraph = {
      isPayerView: false,
      familyLabel: null,
      invoices: [],
      familyMembers: [],
      isHouseholdGroupSpace: false,
      linkedHouseholdFamilies: [],
    };

    const activeMember = await this.prisma.member.findFirst({
      where: { id: memberId, clubId, status: MemberStatus.ACTIVE },
    });
    if (!activeMember?.userId) {
      return empty;
    }
    if (isStrictlyMinorProfile(activeMember.birthDate, new Date())) {
      return empty;
    }

    const memberFamilyLinks = await this.prisma.familyMember.findMany({
      where: { memberId, family: { clubId } },
      include: { family: { include: { householdGroup: true } } },
    });

    const householdGroup =
      memberFamilyLinks
        .map((l) => l.family.householdGroup)
        .find((g) => g != null) ?? null;

    let invoiceWhere: Prisma.InvoiceWhereInput;
    let familyLabel: string | null;
    let familyMemberRows: {
      memberId: string;
      firstName: string;
      lastName: string;
      photoUrl: string | null;
    }[];

    let linkedHouseholdFamilies: ViewerLinkedHouseholdFamilyGraph[] = [];

    if (householdGroup) {
      const nowHg = new Date();
      const viewerPayerFamilyIds =
        await this.families.viewerPayerFamilyIdsInHouseholdGroup(
          viewerUserId,
          householdGroup.id,
        );
      const householdInclusion = {
        viewerPayerFamilyIds,
      };
      invoiceWhere = {
        clubId,
        ...buildInvoiceWhereForHouseholdGroup({
          kind: 'householdGroup',
          householdGroupId: householdGroup.id,
          carrierFamilyId: householdGroup.carrierFamilyId ?? null,
        }),
      };
      familyLabel =
        householdGroup.label ?? memberFamilyLinks[0]?.family.label ?? null;
      const groupFamilies = await this.prisma.family.findMany({
        where: { householdGroupId: householdGroup.id, clubId },
        select: { id: true, label: true },
        orderBy: { createdAt: 'asc' },
      });
      const groupFamilyIds = groupFamilies.map((f) => f.id);
      for (const gf of groupFamilies) {
        const famLinks = await this.prisma.familyMember.findMany({
          where: { familyId: gf.id, memberId: { not: null } },
          include: { member: true },
          orderBy: { createdAt: 'asc' },
        });
        const visibleInResidence = famLinks.filter(
          (fm) =>
            fm.member &&
            shouldIncludeMemberInHouseholdViewerProfiles(
              viewerUserId,
              fm.member,
              nowHg,
              {
                candidateFamilyId: fm.familyId,
                ...householdInclusion,
              },
            ),
        );
        linkedHouseholdFamilies.push({
          familyId: gf.id,
          label: gf.label,
          members: visibleInResidence.map((fm) => ({
            memberId: fm.memberId!,
            firstName: fm.member!.firstName,
            lastName: fm.member!.lastName,
            photoUrl: fm.member!.photoUrl,
          })),
        });
      }
      const gLinks = await this.prisma.familyMember.findMany({
        where: { familyId: { in: groupFamilyIds }, memberId: { not: null } },
        include: { member: true },
        orderBy: { createdAt: 'asc' },
      });
      const uniq = new Map<
        string,
        {
          memberId: string;
          firstName: string;
          lastName: string;
          photoUrl: string | null;
        }
      >();
      for (const fm of gLinks) {
        if (
          !fm.memberId ||
          !fm.member ||
          !shouldIncludeMemberInHouseholdViewerProfiles(
            viewerUserId,
            fm.member,
            nowHg,
            {
              candidateFamilyId: fm.familyId,
              ...householdInclusion,
            },
          )
        ) {
          continue;
        }
        if (!uniq.has(fm.memberId)) {
          uniq.set(fm.memberId, {
            memberId: fm.memberId,
            firstName: fm.member.firstName,
            lastName: fm.member.lastName,
            photoUrl: fm.member.photoUrl,
          });
        }
      }
      familyMemberRows = [...uniq.values()];
    } else {
      const payerLink = memberFamilyLinks.find(
        (l) => l.linkRole === FamilyMemberLinkRole.PAYER,
      );
      if (!payerLink) {
        return empty;
      }
      const familyId = payerLink.familyId;
      familyLabel = payerLink.family.label ?? null;
      const links = await this.prisma.familyMember.findMany({
        where: { familyId, memberId: { not: null } },
        include: { member: true },
        orderBy: { createdAt: 'asc' },
      });
      familyMemberRows = links
        .filter((fm) => fm.memberId != null && fm.member)
        .map((fm) => ({
          memberId: fm.memberId!,
          firstName: fm.member!.firstName,
          lastName: fm.member!.lastName,
          photoUrl: fm.member!.photoUrl,
        }));
      invoiceWhere = { clubId, familyId };
    }

    const paymentInclude = {
      payments: {
        orderBy: { createdAt: 'asc' as const },
        include: {
          paidByMember: { select: { firstName: true, lastName: true } },
          paidByContact: { select: { firstName: true, lastName: true } },
        },
      },
    };
    const [openRows, paidRows] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          ...invoiceWhere,
          status: InvoiceStatus.OPEN,
        },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
        include: paymentInclude,
      }),
      this.prisma.invoice.findMany({
        where: {
          ...invoiceWhere,
          status: InvoiceStatus.PAID,
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: paymentInclude,
      }),
    ]);

    const toSummary = (inv: (typeof openRows)[0]) => {
      const paidSum = inv.payments.reduce((s, p) => s + p.amountCents, 0);
      const { totalPaidCents, balanceCents } = invoicePaymentTotals(
        inv.amountCents,
        paidSum,
      );
      const payments: ViewerInvoicePaymentSnippetGraph[] = inv.payments.map(
        (p) => ({
          id: p.id,
          amountCents: p.amountCents,
          method: p.method,
          createdAt: p.createdAt,
          paidByFirstName:
            p.paidByMember?.firstName ?? p.paidByContact?.firstName ?? null,
          paidByLastName:
            p.paidByMember?.lastName ?? p.paidByContact?.lastName ?? null,
        }),
      );
      return {
        id: inv.id,
        label: inv.label,
        status: inv.status,
        dueAt: inv.dueAt,
        amountCents: inv.amountCents,
        totalPaidCents,
        balanceCents,
        payments,
      };
    };

    return {
      isPayerView: true,
      familyLabel,
      invoices: [...openRows.map(toSummary), ...paidRows.map(toSummary)],
      familyMembers: familyMemberRows,
      isHouseholdGroupSpace: householdGroup != null,
      linkedHouseholdFamilies,
    };
  }

  /** Facturation portail pour un payeur « contact » (sans fiche adhérent). */
  async viewerFamilyBillingSummaryForContact(
    clubId: string,
    contactId: string,
    viewerUserId: string,
  ): Promise<ViewerFamilyBillingSummaryGraph> {
    const empty: ViewerFamilyBillingSummaryGraph = {
      isPayerView: false,
      familyLabel: null,
      invoices: [],
      familyMembers: [],
      isHouseholdGroupSpace: false,
      linkedHouseholdFamilies: [],
    };

    const link = await this.prisma.familyMember.findFirst({
      where: {
        contactId,
        linkRole: FamilyMemberLinkRole.PAYER,
        family: { clubId },
        contact: { userId: viewerUserId },
      },
      include: {
        family: { include: { householdGroup: true } },
      },
    });
    if (!link) {
      return empty;
    }

    const householdGroup = link.family.householdGroup;
    let invoiceWhere: Prisma.InvoiceWhereInput;
    let familyLabel: string | null;
    let familyMemberRows: {
      memberId: string;
      firstName: string;
      lastName: string;
      photoUrl: string | null;
    }[];

    let linkedHouseholdFamilies: ViewerLinkedHouseholdFamilyGraph[] = [];

    if (householdGroup) {
      const nowHg = new Date();
      const viewerPayerFamilyIds =
        await this.families.viewerPayerFamilyIdsInHouseholdGroup(
          viewerUserId,
          householdGroup.id,
        );
      const householdInclusion = {
        viewerPayerFamilyIds,
      };
      invoiceWhere = {
        clubId,
        ...buildInvoiceWhereForHouseholdGroup({
          kind: 'householdGroup',
          householdGroupId: householdGroup.id,
          carrierFamilyId: householdGroup.carrierFamilyId ?? null,
        }),
      };
      familyLabel = householdGroup.label ?? link.family.label ?? null;
      const groupFamilies = await this.prisma.family.findMany({
        where: { householdGroupId: householdGroup.id, clubId },
        select: { id: true, label: true },
        orderBy: { createdAt: 'asc' },
      });
      const groupFamilyIds = groupFamilies.map((f) => f.id);
      for (const gf of groupFamilies) {
        const famLinks = await this.prisma.familyMember.findMany({
          where: { familyId: gf.id, memberId: { not: null } },
          include: { member: true },
          orderBy: { createdAt: 'asc' },
        });
        const visibleInResidence = famLinks.filter(
          (fm) =>
            fm.member &&
            shouldIncludeMemberInHouseholdViewerProfiles(
              viewerUserId,
              fm.member,
              nowHg,
              {
                candidateFamilyId: fm.familyId,
                ...householdInclusion,
              },
            ),
        );
        linkedHouseholdFamilies.push({
          familyId: gf.id,
          label: gf.label,
          members: visibleInResidence.map((fm) => ({
            memberId: fm.memberId!,
            firstName: fm.member!.firstName,
            lastName: fm.member!.lastName,
            photoUrl: fm.member!.photoUrl,
          })),
        });
      }
      const gLinks = await this.prisma.familyMember.findMany({
        where: { familyId: { in: groupFamilyIds }, memberId: { not: null } },
        include: { member: true },
        orderBy: { createdAt: 'asc' },
      });
      const uniq = new Map<
        string,
        {
          memberId: string;
          firstName: string;
          lastName: string;
          photoUrl: string | null;
        }
      >();
      for (const fm of gLinks) {
        if (
          !fm.memberId ||
          !fm.member ||
          !shouldIncludeMemberInHouseholdViewerProfiles(
            viewerUserId,
            fm.member,
            nowHg,
            {
              candidateFamilyId: fm.familyId,
              ...householdInclusion,
            },
          )
        ) {
          continue;
        }
        if (!uniq.has(fm.memberId)) {
          uniq.set(fm.memberId, {
            memberId: fm.memberId,
            firstName: fm.member.firstName,
            lastName: fm.member.lastName,
            photoUrl: fm.member.photoUrl,
          });
        }
      }
      familyMemberRows = [...uniq.values()];
    } else {
      const familyId = link.familyId;
      familyLabel = link.family.label ?? null;
      const links = await this.prisma.familyMember.findMany({
        where: { familyId, memberId: { not: null } },
        include: { member: true },
        orderBy: { createdAt: 'asc' },
      });
      familyMemberRows = links
        .filter((fm) => fm.memberId != null && fm.member)
        .map((fm) => ({
          memberId: fm.memberId!,
          firstName: fm.member!.firstName,
          lastName: fm.member!.lastName,
          photoUrl: fm.member!.photoUrl,
        }));
      invoiceWhere = { clubId, familyId };
    }

    const paymentInclude = {
      payments: {
        orderBy: { createdAt: 'asc' as const },
        include: {
          paidByMember: { select: { firstName: true, lastName: true } },
          paidByContact: { select: { firstName: true, lastName: true } },
        },
      },
    };
    const [openRows, paidRows] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          ...invoiceWhere,
          status: InvoiceStatus.OPEN,
        },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
        include: paymentInclude,
      }),
      this.prisma.invoice.findMany({
        where: {
          ...invoiceWhere,
          status: InvoiceStatus.PAID,
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: paymentInclude,
      }),
    ]);

    const toSummary = (inv: (typeof openRows)[0]) => {
      const paidSum = inv.payments.reduce((s, p) => s + p.amountCents, 0);
      const { totalPaidCents, balanceCents } = invoicePaymentTotals(
        inv.amountCents,
        paidSum,
      );
      const payments: ViewerInvoicePaymentSnippetGraph[] = inv.payments.map(
        (p) => ({
          id: p.id,
          amountCents: p.amountCents,
          method: p.method,
          createdAt: p.createdAt,
          paidByFirstName:
            p.paidByMember?.firstName ?? p.paidByContact?.firstName ?? null,
          paidByLastName:
            p.paidByMember?.lastName ?? p.paidByContact?.lastName ?? null,
        }),
      );
      return {
        id: inv.id,
        label: inv.label,
        status: inv.status,
        dueAt: inv.dueAt,
        amountCents: inv.amountCents,
        totalPaidCents,
        balanceCents,
        payments,
      };
    };

    return {
      isPayerView: true,
      familyLabel,
      invoices: [...openRows.map(toSummary), ...paidRows.map(toSummary)],
      familyMembers: familyMemberRows,
      isHouseholdGroupSpace: householdGroup != null,
      linkedHouseholdFamilies,
    };
  }

  async viewerPromoteSelfToMember(
    clubId: string,
    contactId: string,
    userId: string,
    input: { civility: MemberCivility; birthDate?: string | null },
  ): Promise<{ memberId: string; firstName: string; lastName: string }> {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, clubId, userId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!contact) {
      throw new NotFoundException('Profil contact introuvable.');
    }
    const res = await this.clubContacts.promoteContactToMember(
      clubId,
      contactId,
      {
        civility: input.civility,
        birthDate: input.birthDate ? new Date(input.birthDate) : null,
      },
    );
    return {
      memberId: res.memberId,
      firstName: contact.firstName,
      lastName: contact.lastName,
    };
  }

  async viewerRegisterChildMember(
    clubId: string,
    userId: string,
    activeProfile: { memberId: string | null; contactId: string | null },
    input: {
      firstName: string;
      lastName: string;
      civility: MemberCivility;
      birthDate: string;
    },
  ): Promise<{ memberId: string; firstName: string; lastName: string }> {
    let familyId: string | null = null;
    let payerEmail: string | null = null;
    if (activeProfile.memberId) {
      const payerLink = await this.prisma.familyMember.findFirst({
        where: {
          memberId: activeProfile.memberId,
          linkRole: FamilyMemberLinkRole.PAYER,
          family: { clubId },
        },
        select: { familyId: true },
      });
      if (!payerLink) {
        throw new BadRequestException(
          'Seul un payeur de foyer peut inscrire un enfant depuis le portail.',
        );
      }
      const me = await this.prisma.member.findFirst({
        where: { id: activeProfile.memberId, clubId },
        select: { email: true },
      });
      familyId = payerLink.familyId;
      payerEmail = me?.email ?? null;
    } else if (activeProfile.contactId) {
      const payerLink = await this.prisma.familyMember.findFirst({
        where: {
          contactId: activeProfile.contactId,
          linkRole: FamilyMemberLinkRole.PAYER,
          family: { clubId },
        },
        select: { familyId: true },
      });
      if (!payerLink) {
        throw new BadRequestException(
          'Seul un payeur de foyer peut inscrire un enfant depuis le portail.',
        );
      }
      const user = await this.prisma.user.findFirst({
        where: { id: userId },
        select: { email: true },
      });
      familyId = payerLink.familyId;
      payerEmail = user?.email ?? null;
    } else {
      throw new BadRequestException('Sélection de profil requise');
    }
    if (!payerEmail) {
      throw new BadRequestException(
        'Adresse e-mail du compte payeur introuvable.',
      );
    }
    await assertMemberEmailAllowedInClub(this.prisma, clubId, payerEmail, {
      memberId: null,
      assumeMemberFamilyId: familyId!,
    });
    const pseudo = await this.memberPseudo.pickAvailablePseudo(
      this.prisma,
      clubId,
      input.firstName,
      input.lastName,
      null,
    );
    const created = await this.prisma.$transaction(async (tx) => {
      const m = await tx.member.create({
        data: {
          clubId,
          firstName: input.firstName,
          lastName: input.lastName,
          pseudo,
          civility: input.civility,
          email: payerEmail!,
          birthDate: new Date(input.birthDate),
          status: MemberStatus.ACTIVE,
          roleAssignments: {
            create: [{ role: MemberClubRole.STUDENT }],
          },
        },
        select: { id: true, firstName: true, lastName: true },
      });
      await tx.familyMember.create({
        data: {
          familyId: familyId!,
          memberId: m.id,
          linkRole: FamilyMemberLinkRole.MEMBER,
        },
      });
      return m;
    });
    await this.families.syncContactUserPayerMemberLinksByEmail(
      clubId,
      payerEmail,
    );
    return {
      memberId: created.id,
      firstName: created.firstName,
      lastName: created.lastName,
    };
  }
}
