import { Module } from '@nestjs/common';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import { FamiliesModule } from '../families/families.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BookingAdminResolver, BookingViewerResolver } from './booking.resolver';
import { BookingService } from './booking.service';

@Module({
  imports: [PrismaModule, FamiliesModule],
  providers: [
    BookingService,
    BookingAdminResolver,
    BookingViewerResolver,
    ClubModuleEnabledGuard,
    ViewerActiveProfileGuard,
  ],
  exports: [BookingService],
})
export class BookingModule {}
