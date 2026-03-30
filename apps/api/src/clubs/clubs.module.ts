import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubsResolver } from './clubs.resolver';

@Module({
  imports: [PrismaModule],
  providers: [ClubsResolver],
})
export class ClubsModule {}
