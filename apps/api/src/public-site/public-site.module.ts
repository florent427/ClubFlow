import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PublicSiteResolver } from './public-site.resolver';
import { PublicSiteService } from './public-site.service';

@Module({
  imports: [PrismaModule],
  providers: [PublicSiteService, PublicSiteResolver],
})
export class PublicSiteModule {}
