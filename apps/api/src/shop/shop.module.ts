import { Module } from '@nestjs/common';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import { FamiliesModule } from '../families/families.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ShopAdminResolver, ShopViewerResolver } from './shop.resolver';
import { ShopService } from './shop.service';
import { ShopStockService } from './shop-stock.service';

@Module({
  imports: [PrismaModule, FamiliesModule],
  providers: [
    ShopService,
    ShopStockService,
    ShopAdminResolver,
    ShopViewerResolver,
    ClubModuleEnabledGuard,
    ViewerActiveProfileGuard,
  ],
  exports: [ShopService, ShopStockService],
})
export class ShopModule {}
