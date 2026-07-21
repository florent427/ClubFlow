import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import { FamiliesModule } from '../families/families.module';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ShopAdminResolver, ShopViewerResolver } from './shop.resolver';
import { ShopCartService } from './shop-cart.service';
import { ShopLowStockNotifierService } from './shop-low-stock-notifier.service';
import { ShopService } from './shop.service';
import { ShopPurchaseOrdersService } from './shop-purchase-orders.service';
import { ShopStockService } from './shop-stock.service';
import { ShopStockSweepService } from './shop-stock-sweep.service';
import { ShopVariantsService } from './shop-variants.service';

// `SchedulerLockService` vient de `SchedulingModule`, qui est @Global : le
// balayage des seuils l'injecte sans réimport.
@Module({
  // `AccountingModule` pour le SEUL `AccountingMappingService` : proposer le
  // compte d'achat 607000 au trésorier. La boutique n'écrit toujours AUCUNE
  // écriture comptable (ADR-0013 §1) — elle pose et lit un lien, rien de plus.
  imports: [PrismaModule, FamiliesModule, MailModule, AccountingModule],
  providers: [
    ShopService,
    ShopCartService,
    ShopStockService,
    ShopPurchaseOrdersService,
    ShopVariantsService,
    ShopStockSweepService,
    ShopLowStockNotifierService,
    ShopAdminResolver,
    ShopViewerResolver,
    ClubModuleEnabledGuard,
    ViewerActiveProfileGuard,
  ],
  exports: [
    ShopService,
    ShopCartService,
    ShopStockService,
    ShopVariantsService,
    ShopPurchaseOrdersService,
  ],
})
export class ShopModule {}
