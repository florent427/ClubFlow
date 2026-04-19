import { Module } from '@nestjs/common';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import { FamiliesModule } from '../families/families.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BlogService } from './blog.service';
import { BlogAdminResolver, BlogViewerResolver } from './blog.resolver';

@Module({
  imports: [PrismaModule, FamiliesModule],
  providers: [
    BlogService,
    BlogAdminResolver,
    BlogViewerResolver,
    ClubModuleEnabledGuard,
    ViewerActiveProfileGuard,
  ],
  exports: [BlogService],
})
export class BlogModule {}
