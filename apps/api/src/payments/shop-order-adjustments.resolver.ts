import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import type { RequestUser } from '../common/types/request-user';
import { ModuleCode } from '../domain/module-registry/module-codes';
import {
  AdjustShopOrderLineInput,
  ShopOrderLineAdjustmentPreviewInput,
} from './dto/adjust-shop-order-line.input';
import {
  ShopOrderLineAdjustmentPreviewGraph,
  ShopOrderLineAdjustmentResultGraph,
} from './models/shop-order-adjustment.model';
import { ShopOrderAdjustmentsService } from './shop-order-adjustments.service';

/**
 * Échange et annulation d'un article d'une commande boutique (ADR-0020). Dans
 * le module paiements, comme l'annulation de la commande : la boutique ne
 * dépend pas des paiements.
 */
@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.SHOP)
export class ShopOrderAdjustmentsResolver {
  constructor(private readonly adjustments: ShopOrderAdjustmentsService) {}

  @Query(() => ShopOrderLineAdjustmentPreviewGraph, {
    name: 'shopOrderLineAdjustmentPreview',
    description:
      'Ce que ferait l’annulation ou l’échange d’articles d’une ligne : différence, remboursements par moyen de paiement, reste à payer, marchandise. N’écrit rien.',
  })
  shopOrderLineAdjustmentPreview(
    @CurrentClub() club: Club,
    @Args('input') input: ShopOrderLineAdjustmentPreviewInput,
  ): Promise<ShopOrderLineAdjustmentPreviewGraph> {
    return this.adjustments.preview(club.id, input);
  }

  @Mutation(() => ShopOrderLineAdjustmentResultGraph, {
    name: 'adjustShopOrderLine',
    description:
      'Annule des articles d’une ligne, ou les échange contre un autre article. Seule la différence bouge : remboursée par le moyen de chaque encaissement, ou facturée à part. Un échange d’une commande remise est signé.',
  })
  adjustShopOrderLine(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: AdjustShopOrderLineInput,
  ): Promise<ShopOrderLineAdjustmentResultGraph> {
    return this.adjustments.adjust(
      club.id,
      user.userId,
      input,
    ) as Promise<ShopOrderLineAdjustmentResultGraph>;
  }
}
