import { UnauthorizedException, UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import type { RequestUser } from '../common/types/request-user';
import { UserNotificationGraph } from './models/user-notification.model';
import { NotificationsService } from './notifications.service';

/**
 * Centre de notifications du compte connecté, tous clubs confondus : la
 * notification système arrive sur l'appareil quel que soit le club actif
 * dans le portail, la page qui s'ouvre au tap doit montrer le message.
 * Pas de garde « club » ni « profil actif » : un contact sans fiche a
 * aussi sa boîte.
 */
@Resolver()
@UseGuards(GqlJwtAuthGuard)
export class NotificationsResolver {
  constructor(private readonly notifications: NotificationsService) {}

  @Query(() => [UserNotificationGraph], { name: 'myNotifications' })
  async myNotifications(
    @CurrentUser() user: RequestUser | undefined,
    @Args('limit', { type: () => Int, nullable: true }) limit: number | null,
  ): Promise<UserNotificationGraph[]> {
    if (!user?.userId) throw new UnauthorizedException();
    return this.notifications.listForUser(user.userId, limit ?? 50);
  }

  @Query(() => Int, { name: 'myUnreadNotificationCount' })
  async myUnreadNotificationCount(
    @CurrentUser() user: RequestUser | undefined,
  ): Promise<number> {
    if (!user?.userId) throw new UnauthorizedException();
    return this.notifications.unreadCount(user.userId);
  }

  @Mutation(() => Boolean)
  async markNotificationRead(
    @CurrentUser() user: RequestUser | undefined,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    if (!user?.userId) throw new UnauthorizedException();
    return this.notifications.markRead(user.userId, id);
  }

  @Mutation(() => Int)
  async markAllNotificationsRead(
    @CurrentUser() user: RequestUser | undefined,
  ): Promise<number> {
    if (!user?.userId) throw new UnauthorizedException();
    return this.notifications.markAllRead(user.userId);
  }
}
