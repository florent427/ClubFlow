import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ShopModule } from '../shop/shop.module';
import { PublicSiteResolver } from './public-site.resolver';
import { PublicSiteService } from './public-site.service';

// `ShopModule` pour `ShopService` : la vitrine ne lit plus la table boutique
// en direct, elle emprunte la projection publique du module (ADR-0012).
@Module({
  imports: [PrismaModule, ShopModule],
  providers: [PublicSiteService, PublicSiteResolver],
})
export class PublicSiteModule {}
