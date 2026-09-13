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
import type { RequestUser } from '../common/types/request-user';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { ShopOrderGraph } from '../shop/models/shop-order.model';
import { CancelAndRefundShopOrderInput } from './dto/cancel-and-refund-shop-order.input';
import {
  ShopOrderCancellationPreviewGraph,
  ShopOrderCancellationResultGraph,
} from './models/shop-order-cancellation.model';
import { ShopOrderRefundsService } from './shop-order-refunds.service';

/**
 * Annulation d'une commande boutique par le club (ADR-0019). Dans le module
 * paiements : annuler touche la facture, sa session de paiement et ses
 * remboursements, et la boutique ne dépend pas des paiements.
 */
@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.SHOP)
export class ShopOrderRefundsResolver {
  constructor(private readonly refunds: ShopOrderRefundsService) {}

  @Query(() => ShopOrderCancellationPreviewGraph, {
    name: 'shopOrderCancellationPreview',
    description:
      'Ce que ferait l’annulation d’une commande : remboursements par moyen de paiement, reste dû éteint, marchandise reprise ou libérée. N’écrit rien.',
  })
  shopOrderCancellationPreview(
    @CurrentClub() club: Club,
    @Args('orderId', { type: () => ID }) orderId: string,
  ): Promise<ShopOrderCancellationPreviewGraph> {
    return this.refunds.preview(club.id, orderId);
  }

  @Mutation(() => ShopOrderCancellationResultGraph, {
    name: 'cancelAndRefundShopOrder',
    description:
      'Annule une commande boutique et rend chaque encaissement par son propre moyen (carte via Stripe, espèces, virement, chèque rendu ou remboursé depuis la banque de sa remise). Le reste dû est éteint par un avoir ; la marchandise revient au club, remise en vente ou déclarée perdue.',
  })
  cancelAndRefundShopOrder(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: CancelAndRefundShopOrderInput,
  ): Promise<ShopOrderCancellationResultGraph> {
    return this.refunds.cancelAndRefund(
      club.id,
      user.userId,
      input,
    ) as Promise<ShopOrderCancellationResultGraph>;
  }

  /**
   * Le geste historique, gardé pour l'application mobile d'administration.
   * Il vit ici et non plus sur le résolveur boutique : annuler doit aussi
   * fermer la session de paiement et l'échéancier de la facture annulée, et la
   * boutique ne connaît pas Stripe.
   */
  @Mutation(() => ShopOrderGraph, {
    name: 'cancelShopOrder',
    description:
      'Annule une commande boutique EN ATTENTE et sans aucun encaissement : libère le stock réservé, annule la facture et ferme sa session de paiement. Une commande réglée, même en partie, passe par cancelAndRefundShopOrder.',
  })
  cancelShopOrder(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ShopOrderGraph> {
    return this.refunds.cancelUnpaid(club.id, id) as Promise<ShopOrderGraph>;
  }
}
