import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminDashboardSummary } from './models/admin-dashboard.model';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(clubId: string): Promise<AdminDashboardSummary> {
    const [activeMembersCount, activeModulesCount] = await Promise.all([
      this.prisma.clubMembership.count({ where: { clubId } }),
      this.prisma.clubModule.count({ where: { clubId, enabled: true } }),
    ]);
    return {
      activeMembersCount,
      activeModulesCount,
      upcomingSessionsCount: 0,
      outstandingPaymentsCount: 0,
      revenueCentsMonth: 0,
    };
  }
}
