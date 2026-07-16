import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { RegisterPublicEventInput } from './dto/register-public-event.input';
import {
  PublicClubEventGraph,
  PublicEventRegistrationResult,
} from './models/public-event.model';
import { EventsService } from './events.service';

/**
 * Resolver PUBLIC des événements — consommé par le site vitrine (SSR +
 * formulaire d'inscription des visiteurs anonymes).
 *
 * Pas de guards : les queries n'exposent que la vue sanitisée
 * `PublicClubEventGraph` (aucune donnée d'inscrit), la mutation crée un
 * Contact + une inscription (pattern formulaire de contact vitrine).
 * Rate-limit serré sur la mutation pour limiter les bots (le front
 * ajoute un honeypot côté route Next).
 */
@Resolver()
export class EventsPublicResolver {
  constructor(private readonly service: EventsService) {}

  @Query(() => [PublicClubEventGraph], { name: 'publicClubEvents' })
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  publicClubEvents(
    @Args('clubSlug') clubSlug: string,
  ): Promise<PublicClubEventGraph[]> {
    return this.service.listPublic(clubSlug) as Promise<
      PublicClubEventGraph[]
    >;
  }

  @Query(() => PublicClubEventGraph, { name: 'publicClubEvent' })
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  publicClubEvent(
    @Args('clubSlug') clubSlug: string,
    @Args('eventSlug') eventSlug: string,
  ): Promise<PublicClubEventGraph> {
    return this.service.getPublicBySlug(
      clubSlug,
      eventSlug,
    ) as Promise<PublicClubEventGraph>;
  }

  @Mutation(() => PublicEventRegistrationResult)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  registerForPublicEvent(
    @Args('input') input: RegisterPublicEventInput,
  ): Promise<PublicEventRegistrationResult> {
    return this.service.registerPublic(input);
  }
}
