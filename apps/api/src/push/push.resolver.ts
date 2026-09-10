import {
  BadRequestException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import type { RequestUser } from '../common/types/request-user';
import { RegisterPushSubscriptionInput } from './dto/register-push-subscription.input';
import { WebPushService } from './push.service';

/**
 * Abonnements Web Push du compte connecté (portail membre).
 *
 * Pas de `ClubContextGuard` : l'abonnement appartient au compte, pas au
 * club. Le club courant (`x-club-id`) est simplement mémorisé s'il est
 * présent, à titre indicatif.
 */
@Resolver()
@UseGuards(GqlJwtAuthGuard)
export class PushResolver {
  constructor(private readonly push: WebPushService) {}

  /** Clé publique VAPID ; `null` tant que le serveur n'est pas configuré. */
  @Query(() => String, { name: 'pushVapidPublicKey', nullable: true })
  pushVapidPublicKey(): string | null {
    return this.push.getPublicKey();
  }

  @Mutation(() => Boolean)
  async registerPushSubscription(
    @CurrentUser() user: RequestUser | undefined,
    @Args('input') input: RegisterPushSubscriptionInput,
    @Context() ctx: { req: Request },
  ): Promise<boolean> {
    if (!user?.userId) throw new UnauthorizedException();
    if (!this.push.enabled) {
      throw new BadRequestException(
        'Les notifications ne sont pas configurées sur ce serveur.',
      );
    }
    const raw = ctx.req?.headers?.['x-club-id'];
    const clubId = Array.isArray(raw) ? raw[0] : raw;
    await this.push.register(user.userId, clubId ?? null, input);
    return true;
  }

  @Mutation(() => Boolean)
  async unregisterPushSubscription(
    @CurrentUser() user: RequestUser | undefined,
    @Args('endpoint') endpoint: string,
  ): Promise<boolean> {
    if (!user?.userId) throw new UnauthorizedException();
    return this.push.unregister(user.userId, endpoint);
  }

  /**
   * Notification de test vers les appareils du compte : permet à
   * l'adhérent de vérifier le réglage depuis la page Paramètres.
   */
  @Mutation(() => Boolean)
  async sendMyPushTest(
    @CurrentUser() user: RequestUser | undefined,
  ): Promise<boolean> {
    if (!user?.userId) throw new UnauthorizedException();
    const report = await this.push.sendToUsers([user.userId], {
      title: 'ClubFlow',
      body: 'Les notifications fonctionnent sur cet appareil.',
      url: '/parametres',
      tag: 'push-test',
    });
    return report.sent > 0;
  }
}
