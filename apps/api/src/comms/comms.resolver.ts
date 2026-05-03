import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { AudienceFilterInput } from './dto/audience-filter.input';
import { CreateMessageCampaignInput } from './dto/create-message-campaign.input';
import { SendQuickMessageInput } from './dto/send-quick-message.input';
import { UpdateMessageCampaignInput } from './dto/update-message-campaign.input';
import { AudiencePreviewGraph } from './models/audience-preview.model';
import { MessageCampaignGraph } from './models/message-campaign.model';
import { SendQuickMessageResult } from './models/send-quick-message-result.model';
import { CommsService } from './comms.service';

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.COMMUNICATION)
export class CommsResolver {
  constructor(private readonly comms: CommsService) {}

  @Query(() => [MessageCampaignGraph], { name: 'clubMessageCampaigns' })
  async clubMessageCampaigns(
    @CurrentClub() club: Club,
  ): Promise<MessageCampaignGraph[]> {
    return this.comms.listCampaigns(club.id);
  }

  /**
   * Preview live de l'audience d'une campagne en cours d'édition côté UI.
   * Le client appelle cette query à chaque changement du filtre (debounce
   * recommandé) pour afficher « 152 destinataires (Léa, Théo, +149) ».
   */
  @Query(() => AudiencePreviewGraph, { name: 'previewClubCampaignAudience' })
  async previewClubCampaignAudience(
    @CurrentClub() club: Club,
    @Args('audience', { type: () => AudienceFilterInput, nullable: true })
    audience: AudienceFilterInput | null,
  ): Promise<AudiencePreviewGraph> {
    return this.comms.previewAudience(club.id, audience);
  }

  @Mutation(() => MessageCampaignGraph)
  async createClubMessageCampaign(
    @CurrentClub() club: Club,
    @Args('input') input: CreateMessageCampaignInput,
  ): Promise<MessageCampaignGraph> {
    return this.comms.createDraft(club.id, input);
  }

  @Mutation(() => MessageCampaignGraph)
  async sendClubMessageCampaign(
    @CurrentClub() club: Club,
    @Args('campaignId', { type: () => ID }) campaignId: string,
  ): Promise<MessageCampaignGraph> {
    return this.comms.sendCampaign(club.id, campaignId);
  }

  @Mutation(() => MessageCampaignGraph)
  async updateClubMessageCampaign(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateMessageCampaignInput,
  ): Promise<MessageCampaignGraph> {
    return this.comms.updateDraft(club.id, input);
  }

  @Mutation(() => Boolean)
  async deleteClubMessageCampaign(
    @CurrentClub() club: Club,
    @Args('campaignId', { type: () => ID }) campaignId: string,
  ): Promise<boolean> {
    return this.comms.deleteDraft(club.id, campaignId);
  }

  @Mutation(() => SendQuickMessageResult)
  async sendClubQuickMessage(
    @CurrentClub() club: Club,
    @Args('input') input: SendQuickMessageInput,
  ): Promise<{ success: boolean }> {
    return this.comms.sendQuickMessage(club.id, input);
  }
}
