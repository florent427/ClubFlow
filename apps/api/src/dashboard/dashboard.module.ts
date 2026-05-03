import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubSearchService } from './club-search.service';
import { DashboardResolver } from './dashboard.resolver';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [PrismaModule],
  providers: [
    DashboardService,
    ClubSearchService,
    DashboardResolver,
  ],
})
export class DashboardModule {}
