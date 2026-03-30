import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DashboardResolver } from './dashboard.resolver';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [PrismaModule],
  providers: [DashboardService, DashboardResolver],
})
export class DashboardModule {}
