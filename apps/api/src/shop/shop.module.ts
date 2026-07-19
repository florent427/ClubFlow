import { Module } from '@nestjs/common';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import { FamiliesModule } from '../families/families.module';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ShopAdminResolver, ShopViewerResolver } from './shop.resolver';
import { ShopLowStockNotifierService } from './shop-low-stock-notifier.service';
import { ShopService } from './shop.service';
import { ShopStockService } from './shop-stock.service';
import { ShopStockSweepService } from './shop-stock-sweep.service';
import { ShopVariantsService } from './shop-variants.service';

// `SchedulerLockService` vient de `SchedulingModule`, qui est @Global : le
// balayage des seuils l'injecte sans réimport.
@Module({
  imports: [PrismaModule, FamiliesModule, MailModule],
  providers: [
    ShopService,
    ShopStockService,
    ShopVariantsService,
    ShopStockSweepService,
    ShopLowStockNotifierService,
    ShopAdminResolver,
    ShopViewerResolver,
    ClubModuleEnabledGuard,
    ViewerActiveProfileGuard,
  ],
  exports: [ShopService, ShopStockService, ShopVariantsService],
})
export class ShopModule {}
