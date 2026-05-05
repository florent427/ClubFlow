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
import { ModuleCode } from '../domain/module-registry/module-codes';
import type { RequestUser } from '../common/types/request-user';
import {
  ApplyCartItemExceptionalDiscountInput,
  CancelMembershipCartInput,
  ListMembershipCartsFilter,
  OpenMembershipCartInput,
  ToggleCartItemLicenseInput,
  UpdateMembershipCartItemInput,
  ValidateMembershipCartInput,
} from './dto/membership-cart.input';
import { MembershipCartGraph } from './models/membership-cart.model';
import { MembershipCartService } from './membership-cart.service';
import { toMembershipCartGraph } from './membership-cart.mapper';

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.MEMBERS)
export class MembershipCartAdminResolver {
  constructor(private readonly service: MembershipCartService) {}

  // ------------ Queries ------------

  @Query(() => [MembershipCartGraph], { name: 'clubMembershipCarts' })
  async clubMembershipCarts(
    @CurrentClub() club: Club,
    @Args('filter', { nullable: true }) filter?: ListMembershipCartsFilter,
  ): Promise<MembershipCartGraph[]> {
    const carts = await this.service.listCartsForClub(club.id, filter ?? {});
    const result: MembershipCartGraph[] = [];
    for (const c of carts) {
      const { preview, productsById, clubOneTimeFees } =
        await this.service.getCartFullForGraph(club.id, c.id);
      result.push(
        toMembershipCartGraph(c, preview, productsById, clubOneTimeFees),
      );
    }
    return result;
  }

  @Query(() => MembershipCartGraph, { name: 'clubMembershipCart' })
  async clubMembershipCart(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<MembershipCartGraph> {
    const { cart, preview, productsById, clubOneTimeFees } =
      await this.service.getCartFullForGraph(club.id, id);
    return toMembershipCartGraph(cart, preview, productsById, clubOneTimeFees);
  }

  // ------------ Mutations ------------

  @Mutation(() => MembershipCartGraph, { name: 'clubOpenMembershipCart' })
  async clubOpenMembershipCart(
    @CurrentClub() club: Club,
    @Args('input') input: OpenMembershipCartInput,
  ): Promise<MembershipCartGraph> {
    if (!input.familyId) {
      throw new Error('familyId requis côté admin');
    }
    const cart = await this.service.getOrOpenCart(
      club.id,
      input.familyId,
      input.clubSeasonId,
    );
    const { cart: full, preview, productsById, clubOneTimeFees } =
      await this.service.getCartFullForGraph(club.id, cart.id);
    return toMembershipCartGraph(full, preview, productsById, clubOneTimeFees);
  }

  @Mutation(() => MembershipCartGraph, {
    name: 'clubCreateAdditionalMembershipCart',
  })
  async clubCreateAdditionalMembershipCart(
    @CurrentClub() club: Club,
    @Args('input') input: OpenMembershipCartInput,
  ): Promise<MembershipCartGraph> {
    if (!input.familyId) {
      throw new Error('familyId requis côté admin');
    }
    const cart = await this.service.openAdditionalCart(
      club.id,
      input.familyId,
      input.clubSeasonId,
    );
    const { cart: full, preview, productsById, clubOneTimeFees } =
      await this.service.getCartFullForGraph(club.id, cart.id);
    return toMembershipCartGraph(full, preview, productsById, clubOneTimeFees);
  }

  @Mutation(() => MembershipCartGraph, { name: 'clubUpdateCartItem' })
  async clubUpdateCartItem(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateMembershipCartItemInput,
  ): Promise<MembershipCartGraph> {
    const item = await this.service.updateItem(club.id, input.itemId, {
      billingRhythm: input.billingRhythm ?? undefined,
      membershipProductId: input.membershipProductId,
      oneTimeFeeOverrideIds: input.oneTimeFeeOverrideIds ?? null,
    });
    const { cart: full, preview, productsById, clubOneTimeFees } =
      await this.service.getCartFullForGraph(club.id, item.cartId);
    return toMembershipCartGraph(full, preview, productsById, clubOneTimeFees);
  }

  @Mutation(() => MembershipCartGraph, { name: 'clubToggleCartItemLicense' })
  async clubToggleCartItemLicense(
    @CurrentClub() club: Club,
    @Args('input') input: ToggleCartItemLicenseInput,
  ): Promise<MembershipCartGraph> {
    const item = await this.service.toggleExistingLicense(
      club.id,
      input.itemId,
      input.hasExistingLicense,
      input.existingLicenseNumber ?? null,
    );
    const { cart: full, preview, productsById, clubOneTimeFees } =
      await this.service.getCartFullForGraph(club.id, item.cartId);
    return toMembershipCartGraph(full, preview, productsById, clubOneTimeFees);
  }

  @Mutation(() => MembershipCartGraph, { name: 'clubRemoveCartItem' })
  async clubRemoveCartItem(
    @CurrentClub() club: Club,
    @Args('itemId', { type: () => ID }) itemId: string,
  ): Promise<MembershipCartGraph> {
    const res = await this.service.removeItem(club.id, itemId);
    const { cart: full, preview, productsById, clubOneTimeFees } =
      await this.service.getCartFullForGraph(club.id, res.cartId);
    return toMembershipCartGraph(full, preview, productsById, clubOneTimeFees);
  }

  @Mutation(() => MembershipCartGraph, {
    name: 'clubApplyCartItemExceptionalDiscount',
  })
  async clubApplyCartItemExceptionalDiscount(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: ApplyCartItemExceptionalDiscountInput,
  ): Promise<MembershipCartGraph> {
    const item = await this.service.applyExceptionalDiscount(
      club.id,
      user.userId,
      input.itemId,
      input.amountCents,
      input.reason,
    );
    const { cart: full, preview, productsById, clubOneTimeFees } =
      await this.service.getCartFullForGraph(club.id, item.cartId);
    return toMembershipCartGraph(full, preview, productsById, clubOneTimeFees);
  }

  @Mutation(() => MembershipCartGraph, { name: 'clubValidateMembershipCart' })
  async clubValidateMembershipCart(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: ValidateMembershipCartInput,
  ): Promise<MembershipCartGraph> {
    const cart = await this.service.validateCart(
      club.id,
      user.userId,
      input.cartId,
      input.lockedPaymentMethod ?? null,
    );
    const { preview, productsById, clubOneTimeFees } =
      await this.service.getCartFullForGraph(club.id, cart.id);
    return toMembershipCartGraph(cart, preview, productsById, clubOneTimeFees);
  }

  @Mutation(() => MembershipCartGraph, { name: 'clubCancelMembershipCart' })
  async clubCancelMembershipCart(
    @CurrentClub() club: Club,
    @Args('input') input: CancelMembershipCartInput,
  ): Promise<MembershipCartGraph> {
    const cart = await this.service.cancelCart(
      club.id,
      input.cartId,
      input.reason,
    );
    const { cart: full, preview, productsById, clubOneTimeFees } =
      await this.service.getCartFullForGraph(club.id, cart.id);
    return toMembershipCartGraph(full, preview, productsById, clubOneTimeFees);
  }
}
