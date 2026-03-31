import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FamilyMemberLinkRole,
  InvoiceStatus,
  MemberStatus,
  type Prisma,
} from '@prisma/client';
import { FamiliesService } from '../families/families.service';
import { normalizeMemberEmail } from '../members/member-email-family-rule';
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

@Injectable()
export class ViewerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planning: PlanningService,
    private readonly families: FamiliesService,
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
      photoUrl: m.photoUrl,
      civility: m.civility,
      medicalCertExpiresAt: m.medicalCertExpiresAt,
      gradeLevelId: m.gradeLevelId,
      gradeLevelLabel: m.gradeLevel?.label ?? null,
      canAccessClubBackOffice,
      adminWorkspaceClubId,
      hasClubFamily,
      canSelfAttachFamilyViaPayerEmail: !hasClubFamily,
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
          paidByFirstName: p.paidByMember?.firstName ?? null,
          paidByLastName: p.paidByMember?.lastName ?? null,
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
}
