import { Injectable } from '@nestjs/common';
import {
  AccountingEntryKind,
  ClubEventStatus,
  GrantApplicationStatus,
  InvoiceStatus,
  MemberStatus,
  ShopOrderStatus,
  SponsorshipDealStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminDashboardSummary } from './models/admin-dashboard.model';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(clubId: string): Promise<AdminDashboardSummary> {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
    );
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

    const [
      activeMembersCount,
      activeModulesCount,
      upcomingSessionsCount,
      outstandingPaymentsCount,
      revenueAgg,
      newMembersThisMonthCount,
      upcomingEventsCount,
      recentAnnouncementsCount,
      pendingShopOrdersCount,
      openGrantApplicationsCount,
      activeSponsorshipDealsCount,
      acctEntries,
    ] = await Promise.all([
      this.prisma.member.count({
        where: { clubId, status: MemberStatus.ACTIVE },
      }),
      this.prisma.clubModule.count({ where: { clubId, enabled: true } }),
      this.prisma.courseSlot.count({
        where: { clubId, startsAt: { gte: now } },
      }),
      this.prisma.invoice.count({
        where: { clubId, status: InvoiceStatus.OPEN },
      }),
      this.prisma.payment.aggregate({
        where: {
          clubId,
          createdAt: { gte: monthStart, lt: monthEnd },
        },
        _sum: { amountCents: true },
      }),
      this.prisma.member.count({
        where: { clubId, createdAt: { gte: monthStart, lt: monthEnd } },
      }),
      this.prisma.clubEvent.count({
        where: {
          clubId,
          status: ClubEventStatus.PUBLISHED,
          startsAt: { gte: now },
        },
      }),
      this.prisma.clubAnnouncement.count({
        where: {
          clubId,
          publishedAt: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.shopOrder.count({
        where: { clubId, status: ShopOrderStatus.PENDING },
      }),
      this.prisma.grantApplication.count({
        where: {
          clubId,
          status: {
            in: [
              GrantApplicationStatus.DRAFT,
              GrantApplicationStatus.SUBMITTED,
            ],
          },
        },
      }),
      this.prisma.sponsorshipDeal.count({
        where: { clubId, status: SponsorshipDealStatus.ACTIVE },
      }),
      this.prisma.accountingEntry.findMany({
        where: { clubId },
        select: { kind: true, amountCents: true },
      }),
    ]);

    let income = 0;
    let expense = 0;
    for (const e of acctEntries) {
      if (e.kind === AccountingEntryKind.INCOME) income += e.amountCents;
      else expense += e.amountCents;
    }

    return {
      activeMembersCount,
      activeModulesCount,
      upcomingSessionsCount,
      outstandingPaymentsCount,
      revenueCentsMonth: revenueAgg._sum.amountCents ?? 0,
      newMembersThisMonthCount,
      upcomingEventsCount,
      recentAnnouncementsCount,
      pendingShopOrdersCount,
      openGrantApplicationsCount,
      activeSponsorshipDealsCount,
      accountingBalanceCents: income - expense,
    };
  }
}
