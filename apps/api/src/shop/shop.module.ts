import { Module } from '@nestjs/common';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import { FamiliesModule } from '../families/families.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ShopAdminResolver, ShopViewerResolver } from './shop.resolver';
import { ShopService } from './shop.service';

@Module({
  imports: [PrismaModule, FamiliesModule],
  providers: [
    ShopService,
    ShopAdminResolver,
    ShopViewerResolver,
    ClubModuleEnabledGuard,
    ViewerActiveProfileGuard,
  ],
  exports: [ShopService],
})
export class ShopModule {}
