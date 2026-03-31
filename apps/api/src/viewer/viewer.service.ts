import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FamilyMemberLinkRole,
  InvoiceStatus,
  MemberStatus,
} from '@prisma/client';
import { invoicePaymentTotals } from '../payments/invoice-totals';
import { PlanningService } from '../planning/planning.service';
import { PrismaService } from '../prisma/prisma.service';
import { ViewerCourseSlotGraph } from './models/viewer-course-slot.model';
import { ViewerFamilyBillingSummaryGraph } from './models/viewer-family-billing.model';
import { ViewerMemberGraph } from './models/viewer-member.model';

@Injectable()
export class ViewerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planning: PlanningService,
  ) {}

  async viewerMe(clubId: string, memberId: string): Promise<ViewerMemberGraph> {
    const m = await this.prisma.member.findFirst({
      where: { id: memberId, clubId, status: MemberStatus.ACTIVE },
      include: { gradeLevel: true },
    });
    if (!m) {
      throw new NotFoundException('Membre introuvable');
    }
    return {
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      photoUrl: m.photoUrl,
      civility: m.civility,
      medicalCertExpiresAt: m.medicalCertExpiresAt,
      gradeLevelId: m.gradeLevelId,
      gradeLevelLabel: m.gradeLevel?.label ?? null,
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
    const payerLink = await this.prisma.familyMember.findFirst({
      where: {
        memberId,
        linkRole: FamilyMemberLinkRole.PAYER,
        family: { clubId },
      },
      include: { family: true },
    });
    if (!payerLink) {
      return {
        isPayerView: false,
        familyLabel: null,
        invoices: [],
        familyMembers: [],
      };
    }
    const familyId = payerLink.familyId;
    const familyLabel = payerLink.family.label ?? null;

    const links = await this.prisma.familyMember.findMany({
      where: { familyId },
      include: { member: true },
      orderBy: { createdAt: 'asc' },
    });
    const familyMembers = links.map((fm) => ({
      memberId: fm.memberId,
      firstName: fm.member.firstName,
      lastName: fm.member.lastName,
      photoUrl: fm.member.photoUrl,
    }));

    const paymentSelect = { payments: { select: { amountCents: true } } };
    const [openRows, paidRows] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          clubId,
          familyId,
          status: InvoiceStatus.OPEN,
        },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
        include: paymentSelect,
      }),
      this.prisma.invoice.findMany({
        where: {
          clubId,
          familyId,
          status: InvoiceStatus.PAID,
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: paymentSelect,
      }),
    ]);

    const toSummary = (inv: (typeof openRows)[0]) => {
      const paidSum = inv.payments.reduce((s, p) => s + p.amountCents, 0);
      const { totalPaidCents, balanceCents } = invoicePaymentTotals(
        inv.amountCents,
        paidSum,
      );
      return {
        id: inv.id,
        label: inv.label,
        status: inv.status,
        dueAt: inv.dueAt,
        amountCents: inv.amountCents,
        totalPaidCents,
        balanceCents,
      };
    };

    return {
      isPayerView: true,
      familyLabel,
      invoices: [...openRows.map(toSummary), ...paidRows.map(toSummary)],
      familyMembers,
    };
  }
}
