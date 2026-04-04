import { Injectable } from '@nestjs/common';
import { InvoiceStatus, MemberStatus } from '@prisma/client';
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

    const [
      activeMembersCount,
      activeModulesCount,
      upcomingSessionsCount,
      outstandingPaymentsCount,
      revenueAgg,
    ] = await Promise.all([
      this.prisma.member.count({
        where: { clubId, status: MemberStatus.ACTIVE },
      }),
      this.prisma.clubModule.count({ where: { clubId, enabled: true } }),
      this.prisma.courseSlot.count({
        where: { clubId, startsAt: { gte: new Date() } },
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
    ]);

    return {
      activeMembersCount,
      activeModulesCount,
      upcomingSessionsCount,
      outstandingPaymentsCount,
      revenueCentsMonth: revenueAgg._sum.amountCents ?? 0,
    };
  }
}
