import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
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
import { UpdateShopProductInput } from './dto/update-shop-product.input';
import { ShopOrderGraph } from './models/shop-order.model';
import { ShopProductGraph } from './models/shop-product.model';
import { ShopService } from './shop.service';

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.SHOP)
export class ShopAdminResolver {
  constructor(private readonly service: ShopService) {}

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
