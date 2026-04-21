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

  /**
   * KPI avec tendance : compare les 30 derniers jours au 30j précédents +
   * agrège stats d'engagement vitrine.
   *
   * Renvoie des ratios plutôt que des pourcentages pré-formatés — le front
   * décide de l'affichage.
   */
  async trends(clubId: string): Promise<{
    revenueLast30Cents: number;
    revenuePrev30Cents: number;
    revenueTrendPct: number;
    newMembersLast30: number;
    newMembersPrev30: number;
    memberGrowthPct: number;
    overdueInvoicesCount: number;
    overdueBalanceCents: number;
    paidOnTimeRate: number;
    vitrinePublishedPagesCount: number;
    vitrinePublishedArticlesCount: number;
    vitrineContactsLast30Count: number;
  }> {
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const d60 = new Date(now.getTime() - 60 * 24 * 3600 * 1000);

    const [
      revenueLast30,
      revenuePrev30,
      newMembersLast30,
      newMembersPrev30,
      overdueInvoices,
      paidInvoicesLast30,
      vitrinePages,
      vitrineArticles,
      vitrineContactsLast30,
    ] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { clubId, createdAt: { gte: d30, lt: now } },
        _sum: { amountCents: true },
      }),
      this.prisma.payment.aggregate({
        where: { clubId, createdAt: { gte: d60, lt: d30 } },
        _sum: { amountCents: true },
      }),
      this.prisma.member.count({
        where: { clubId, createdAt: { gte: d30, lt: now } },
      }),
      this.prisma.member.count({
        where: { clubId, createdAt: { gte: d60, lt: d30 } },
      }),
      this.prisma.invoice.findMany({
        where: {
          clubId,
          status: InvoiceStatus.OPEN,
          dueAt: { lt: now },
        },
        include: { payments: true },
      }),
      this.prisma.invoice.findMany({
        where: {
          clubId,
          status: InvoiceStatus.PAID,
          updatedAt: { gte: d30, lt: now },
        },
        select: { dueAt: true, updatedAt: true },
      }),
      this.prisma.vitrinePage.count({
        where: { clubId, status: 'PUBLISHED' },
      }),
      this.prisma.vitrineArticle.count({
        where: { clubId, status: 'PUBLISHED', publishedAt: { not: null } },
      }),
      this.prisma.contact.count({
        where: { clubId, createdAt: { gte: d30, lt: now } },
      }),
    ]);

    const revenueLast30Cents = revenueLast30._sum.amountCents ?? 0;
    const revenuePrev30Cents = revenuePrev30._sum.amountCents ?? 0;
    const revenueTrendPct = percentChange(
      revenueLast30Cents,
      revenuePrev30Cents,
    );
    const memberGrowthPct = percentChange(
      newMembersLast30,
      newMembersPrev30,
    );
    const overdueBalanceCents = overdueInvoices.reduce((sum, inv) => {
      const paid = inv.payments.reduce((s, p) => s + p.amountCents, 0);
      return sum + Math.max(0, inv.amountCents - paid);
    }, 0);
    const paidOnTimeCount = paidInvoicesLast30.filter(
      (inv) => inv.dueAt == null || inv.updatedAt <= inv.dueAt,
    ).length;
    const paidOnTimeRate =
      paidInvoicesLast30.length > 0
        ? paidOnTimeCount / paidInvoicesLast30.length
        : 1;

    return {
      revenueLast30Cents,
      revenuePrev30Cents,
      revenueTrendPct,
      newMembersLast30,
      newMembersPrev30,
      memberGrowthPct,
      overdueInvoicesCount: overdueInvoices.length,
      overdueBalanceCents,
      paidOnTimeRate,
      vitrinePublishedPagesCount: vitrinePages,
      vitrinePublishedArticlesCount: vitrineArticles,
      vitrineContactsLast30Count: vitrineContactsLast30,
    };
  }
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return ((current - previous) / previous) * 100;
}
