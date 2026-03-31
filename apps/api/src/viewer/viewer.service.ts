import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FamilyMemberLinkRole,
  InvoiceStatus,
  MemberStatus,
  type Prisma,
} from '@prisma/client';
import { resolveAdminWorkspaceClubId } from '../common/club-back-office-role';
import { buildInvoiceWhereForHouseholdGroup } from '../families/household-billing.scope';
import { isStrictlyMinorProfile } from '../families/viewer-profile-rules';
import { invoicePaymentTotals } from '../payments/invoice-totals';
import { PlanningService } from '../planning/planning.service';
import { PrismaService } from '../prisma/prisma.service';
import { ViewerCourseSlotGraph } from './models/viewer-course-slot.model';
import { ViewerFamilyBillingSummaryGraph } from './models/viewer-family-billing.model';
import { ViewerInvoicePaymentSnippetGraph } from './models/viewer-invoice-payment-snippet.model';
import { ViewerMemberGraph } from './models/viewer-member.model';

@Injectable()
export class ViewerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planning: PlanningService,
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
  ): Promise<ViewerFamilyBillingSummaryGraph> {
    const empty: ViewerFamilyBillingSummaryGraph = {
      isPayerView: false,
      familyLabel: null,
      invoices: [],
      familyMembers: [],
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

    if (householdGroup) {
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
      const groupFamilyIds = (
        await this.prisma.family.findMany({
          where: { householdGroupId: householdGroup.id },
          select: { id: true },
        })
      ).map((f) => f.id);
      const gLinks = await this.prisma.familyMember.findMany({
        where: { familyId: { in: groupFamilyIds } },
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
        where: { familyId },
        include: { member: true },
        orderBy: { createdAt: 'asc' },
      });
      familyMemberRows = links.map((fm) => ({
        memberId: fm.memberId,
        firstName: fm.member.firstName,
        lastName: fm.member.lastName,
        photoUrl: fm.member.photoUrl,
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
    };
  }
}
