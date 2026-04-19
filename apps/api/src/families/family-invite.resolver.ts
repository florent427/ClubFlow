import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { GqlThrottlerGuard } from '../common/guards/gql-throttler.guard';
import { PreviewFamilyInviteInput } from './dto/preview-family-invite.input';
import { FamilyInviteService } from './family-invite.service';
import { FamilyInvitePreviewGraph } from './models/family-invite-preview.model';

@Resolver()
@UseGuards(GqlThrottlerGuard)
export class FamilyInviteResolver {
  constructor(private readonly invites: FamilyInviteService) {}

  @Mutation(() => FamilyInvitePreviewGraph, {
    name: 'previewFamilyInvite',
    description:
      'Prévisualise une invitation à partir d’un code ou d’un jeton brut (sans authentification).',
  })
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  previewFamilyInvite(
    @Args('input') input: PreviewFamilyInviteInput,
  ): Promise<FamilyInvitePreviewGraph> {
    return this.invites.previewInvite(input.code);
  }
}
