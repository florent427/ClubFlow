import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubsResolver } from './clubs.resolver';
import { ClubsService } from './clubs.service';

@Module({
  imports: [PrismaModule],
  providers: [ClubsResolver, ClubsService],
  exports: [ClubsService],
})
export class ClubsModule {}
