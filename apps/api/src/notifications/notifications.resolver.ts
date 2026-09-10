import { UnauthorizedException, UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import type { RequestUser } from '../common/types/request-user';
import { UserNotificationGraph } from './models/user-notification.model';
import { NotificationsService } from './notifications.service';

/**
 * Centre de notifications du compte connecté, pour le club courant
 * (`x-club-id`). Pas de garde « profil actif » : un contact sans fiche
 * adhérent a aussi son centre.
 */
@Resolver()
@UseGuards(GqlJwtAuthGuard, ClubContextGuard)
export class NotificationsResolver {
  constructor(private readonly notifications: NotificationsService) {}

  @Query(() => [UserNotificationGraph], { name: 'myNotifications' })
  async myNotifications(
    @CurrentUser() user: RequestUser | undefined,
    @CurrentClub() club: Club,
    @Args('limit', { type: () => Int, nullable: true }) limit: number | null,
  ): Promise<UserNotificationGraph[]> {
    if (!user?.userId) throw new UnauthorizedException();
    return this.notifications.listForUser(user.userId, club.id, limit ?? 50);
  }

  @Query(() => Int, { name: 'myUnreadNotificationCount' })
  async myUnreadNotificationCount(
    @CurrentUser() user: RequestUser | undefined,
    @CurrentClub() club: Club,
  ): Promise<number> {
    if (!user?.userId) throw new UnauthorizedException();
    return this.notifications.unreadCount(user.userId, club.id);
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
    @CurrentClub() club: Club,
  ): Promise<number> {
    if (!user?.userId) throw new UnauthorizedException();
    return this.notifications.markAllRead(user.userId, club.id);
  }
}
