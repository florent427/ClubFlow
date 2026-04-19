import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BookingAdminResolver, BookingViewerResolver } from './booking.resolver';
import { BookingService } from './booking.service';

@Module({
  imports: [PrismaModule],
  providers: [BookingService, BookingAdminResolver, BookingViewerResolver],
  exports: [BookingService],
})
export class BookingModule {}
