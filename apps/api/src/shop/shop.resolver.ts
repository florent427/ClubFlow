import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import type { RequestUser } from '../common/types/request-user';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { CreateShopProductInput } from './dto/create-shop-product.input';
import { PlaceShopOrderInput } from './dto/place-shop-order.input';
import {
  AdjustShopVariantStockInput,
  RecordShopVariantShrinkageInput,
  RestockShopVariantInput,
  SetShopProductOptionsInput,
  UpdateShopProductVariantInput,
} from './dto/shop-variant.input';
import { UpdateShopProductInput } from './dto/update-shop-product.input';
import { ShopOrderGraph } from './models/shop-order.model';
import { ShopProductGraph } from './models/shop-product.model';
import {
  ShopLowStockVariantGraph,
  ShopProductOptionGraph,
  ShopStockMovementGraph,
  ShopStockSweepReportGraph,
} from './models/shop-stock.model';
import { ShopService } from './shop.service';
import { ShopStockSweepService } from './shop-stock-sweep.service';
import { ShopVariantsService } from './shop-variants.service';

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.SHOP)
export class ShopAdminResolver {
  constructor(
    private readonly service: ShopService,
    private readonly variants: ShopVariantsService,
    private readonly sweep: ShopStockSweepService,
  ) {}

  @Query(() => [ShopProductGraph], { name: 'shopProducts' })
  shopProducts(@CurrentClub() club: Club): Promise<ShopProductGraph[]> {
    return this.service.listProductsAdmin(club.id) as Promise<ShopProductGraph[]>;
  }

  @Mutation(() => ShopProductGraph)
  createShopProduct(
    @CurrentClub() club: Club,
    @Args('input') input: CreateShopProductInput,
  ): Promise<ShopProductGraph> {
    return this.service.createProduct(club.id, input) as Promise<ShopProductGraph>;
  }

  @Mutation(() => ShopProductGraph)
  updateShopProduct(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateShopProductInput,
  ): Promise<ShopProductGraph> {
    return this.service.updateProduct(club.id, input.id, {
      name: input.name,
      sku: input.sku,
      description: input.description,
      imageUrl: input.imageUrl,
      priceCents: input.priceCents,
      stock: input.stock,
      active: input.active,
    }) as Promise<ShopProductGraph>;
  }

  @Mutation(() => Boolean)
  deleteShopProduct(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.service.deleteProduct(club.id, id);
  }

  @Query(() => [ShopOrderGraph], { name: 'shopOrders' })
  shopOrders(@CurrentClub() club: Club): Promise<ShopOrderGraph[]> {
    return this.service.listOrdersAdmin(club.id) as Promise<ShopOrderGraph[]>;
  }

  @Mutation(() => ShopOrderGraph)
  markShopOrderPaid(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ShopOrderGraph> {
    return this.service.markOrderPaid(club.id, id) as Promise<ShopOrderGraph>;
  }

  @Mutation(() => ShopOrderGraph)
  cancelShopOrder(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ShopOrderGraph> {
    return this.service.cancelOrder(club.id, id) as Promise<ShopOrderGraph>;
  }

  // --- Déclinaisons (ADR-0012) ---
  //
  // Tout est ici, sur le résolveur ADMIN, et nulle part ailleurs : c'est lui
  // qui porte les quatre gardes et le gating de module. Poser une seule de ces
  // mutations sur un autre résolveur perdrait SILENCIEUSEMENT le contrôle de
  // rôle ET le gating — sans erreur, sans test rouge.

  @Query(() => [ShopProductOptionGraph], { name: 'shopProductOptions' })
  shopProductOptions(
    @CurrentClub() club: Club,
    @Args('productId', { type: () => ID }) productId: string,
  ): Promise<ShopProductOptionGraph[]> {
    return this.variants.listOptions(club.id, productId) as Promise<
      ShopProductOptionGraph[]
    >;
  }

  @Mutation(() => ShopProductGraph, {
    description:
      'Définit les axes de déclinaison et leurs valeurs. Les déclinaisons dont la combinaison devient invalide sont DÉSACTIVÉES, jamais supprimées.',
  })
  setShopProductOptions(
    @CurrentClub() club: Club,
    @Args('input') input: SetShopProductOptionsInput,
  ): Promise<ShopProductGraph> {
    return this.variants.setOptions(
      club.id,
      input.productId,
      input.axes,
    ) as Promise<ShopProductGraph>;
  }

  @Mutation(() => ShopProductGraph, {
    description:
      'Engendre les combinaisons manquantes. Idempotent : une combinaison déjà présente est ignorée.',
  })
  generateShopProductVariants(
    @CurrentClub() club: Club,
    @Args('productId', { type: () => ID }) productId: string,
  ): Promise<ShopProductGraph> {
    return this.variants.generateVariants(
      club.id,
      productId,
    ) as Promise<ShopProductGraph>;
  }

  @Mutation(() => ShopProductGraph)
  updateShopProductVariant(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateShopProductVariantInput,
  ): Promise<ShopProductGraph> {
    const { variantId, ...rest } = input;
    return this.variants.updateVariant(
      club.id,
      variantId,
      rest,
    ) as Promise<ShopProductGraph>;
  }

  @Mutation(() => ShopProductGraph, {
    description: 'Réception fournisseur : les deux compteurs montent ensemble.',
  })
  restockShopVariant(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: RestockShopVariantInput,
  ): Promise<ShopProductGraph> {
    return this.variants.restock(club.id, {
      variantId: input.variantId,
      qty: input.qty,
      reason: input.reason ?? null,
      userId: user.userId,
    }) as Promise<ShopProductGraph>;
  }

  @Mutation(() => ShopProductGraph, {
    description:
      'Correction après comptage physique : déclarez ce que vous avez COMPTÉ, l’écart est calculé.',
  })
  adjustShopVariantStock(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: AdjustShopVariantStockInput,
  ): Promise<ShopProductGraph> {
    return this.variants.adjustStock(club.id, {
      variantId: input.variantId,
      countedOnHand: input.countedOnHand,
      reason: input.reason ?? null,
      userId: user.userId,
    }) as Promise<ShopProductGraph>;
  }

  @Mutation(() => ShopProductGraph, { description: 'Perte, casse, vol.' })
  recordShopVariantShrinkage(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: RecordShopVariantShrinkageInput,
  ): Promise<ShopProductGraph> {
    return this.variants.recordShrinkage(club.id, {
      variantId: input.variantId,
      qty: input.qty,
      reason: input.reason,
      userId: user.userId,
    }) as Promise<ShopProductGraph>;
  }

  @Query(() => [ShopStockMovementGraph], { name: 'shopStockMovements' })
  shopStockMovements(
    @CurrentClub() club: Club,
    @Args('variantId', { type: () => ID, nullable: true }) variantId?: string,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
  ): Promise<ShopStockMovementGraph[]> {
    return this.variants.listMovements(club.id, {
      variantId,
      take,
      skip,
    }) as Promise<ShopStockMovementGraph[]>;
  }

  @Query(() => [ShopLowStockVariantGraph], { name: 'shopLowStockVariants' })
  shopLowStockVariants(
    @CurrentClub() club: Club,
  ): Promise<ShopLowStockVariantGraph[]> {
    return this.variants.listLowStock(club.id) as Promise<
      ShopLowStockVariantGraph[]
    >;
  }

  @Mutation(() => ShopStockSweepReportGraph, {
    name: 'triggerShopStockSweep',
    nullable: true,
    description:
      'Rejoue immédiatement le balayage des seuils du club. Le passage quotidien de 7h fait ce travail ; cette mutation permet de ne pas l’attendre. Renvoie NULL si un balayage est déjà en cours — à ne pas confondre avec un rapport à zéro, qui signifie « rien à signaler ».',
  })
  triggerShopStockSweep(
    @CurrentClub() club: Club,
  ): Promise<ShopStockSweepReportGraph | null> {
    // Scopé au club appelant, et sous LE MÊME verrou que le cron : un admin ne
    // déclenche jamais les alertes d'un autre tenant, et deux passages
    // concurrents ne peuvent pas doubler les envois.
    return this.sweep.triggerForClub(club.id);
  }
}

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ViewerActiveProfileGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.SHOP)
export class ShopViewerResolver {
  constructor(private readonly service: ShopService) {}

  @Query(() => [ShopProductGraph], { name: 'viewerShopProducts' })
  viewerShopProducts(@CurrentClub() club: Club): Promise<ShopProductGraph[]> {
    return this.service.listProductsPublic(club.id) as Promise<ShopProductGraph[]>;
  }

  @Query(() => [ShopOrderGraph], { name: 'viewerShopOrders' })
  viewerShopOrders(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
  ): Promise<ShopOrderGraph[]> {
    return this.service.listOrdersForViewer(club.id, {
      memberId: user.activeProfileMemberId,
      contactId: user.activeProfileContactId,
    }) as Promise<ShopOrderGraph[]>;
  }

  @Mutation(() => ShopOrderGraph)
  viewerPlaceShopOrder(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: PlaceShopOrderInput,
  ): Promise<ShopOrderGraph> {
    return this.service.placeOrder(
      club.id,
      {
        memberId: user.activeProfileMemberId,
        contactId: user.activeProfileContactId,
      },
      input,
    ) as Promise<ShopOrderGraph>;
  }
}
