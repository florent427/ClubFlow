import { Module } from '@nestjs/common';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { BlogService } from './blog.service';
import { BlogAdminResolver, BlogViewerResolver } from './blog.resolver';

@Module({
  imports: [PrismaModule],
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
