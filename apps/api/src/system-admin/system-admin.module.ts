import { Module } from '@nestjs/common';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import {
  SuperAdminGuard,
  SystemAdminGuard,
} from '../common/guards/system-admin.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemAdminResolver } from './system-admin.resolver';
import { SystemAdminService } from './system-admin.service';

@Module({
  imports: [PrismaModule],
  providers: [
    SystemAdminService,
    SystemAdminResolver,
    SystemAdminGuard,
    SuperAdminGuard,
    ClubContextGuard,
  ],
  exports: [SystemAdminService, SystemAdminGuard, SuperAdminGuard],
})
export class SystemAdminModule {}
