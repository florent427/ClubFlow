import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { GqlThrottlerGuard } from '../common/guards/gql-throttler.guard';
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
// Active réellement les @Throttle ci-dessous (limite les bots sur la
// mutation d'inscription anonyme). Sans ce guard, @Throttle est inerte.
@UseGuards(GqlThrottlerGuard)
export class EventsPublicResolver {
  constructor(private readonly service: EventsService) {}

  // Note : nom `publicOpenEvent(s)` distinct de `publicClubEvents` du
  // module public-site (qui liste TOUS les événements à venir) — éviter
  // la collision de nom de query qui shadowait ce resolver.
  @Query(() => [PublicClubEventGraph], { name: 'publicOpenEvents' })
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  publicOpenEvents(
    @Args('clubSlug') clubSlug: string,
  ): Promise<PublicClubEventGraph[]> {
    return this.service.listPublic(clubSlug) as Promise<
      PublicClubEventGraph[]
    >;
  }

  @Query(() => PublicClubEventGraph, { name: 'publicOpenEvent' })
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  publicOpenEvent(
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
    return this.service.registerPublic({
      clubSlug: input.clubSlug,
      eventSlug: input.eventSlug,
      programItemIds: input.programItemIds,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      note: input.note,
    });
  }
}
