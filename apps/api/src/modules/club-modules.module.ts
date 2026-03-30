import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubModulesResolver } from './club-modules.resolver';
import { ClubModulesService } from './club-modules.service';

@Module({
  imports: [PrismaModule],
  providers: [ClubModulesService, ClubModulesResolver],
})
export class ClubModulesModule {}
