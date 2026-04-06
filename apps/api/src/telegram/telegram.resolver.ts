import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { TelegramLinkPayload } from './models/telegram-link-payload.model';
import { TelegramLinkService } from './telegram-link.service';

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.COMMUNICATION)
export class TelegramResolver {
  constructor(private readonly link: TelegramLinkService) {}

  @Mutation(() => TelegramLinkPayload)
  async issueTelegramMemberLink(
    @CurrentClub() club: Club,
    @Args('memberId', { type: () => ID }) memberId: string,
  ): Promise<TelegramLinkPayload> {
    return this.link.createInviteLink(club.id, memberId);
  }

  @Mutation(() => Boolean)
  async disconnectMemberTelegram(
    @CurrentClub() club: Club,
    @Args('memberId', { type: () => ID }) memberId: string,
  ): Promise<boolean> {
    return this.link.disconnectTelegram(club.id, memberId);
  }
}
