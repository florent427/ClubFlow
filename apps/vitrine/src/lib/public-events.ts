import 'server-only';
import { fetchGraphQL } from './graphql-client';

/**
 * Fetchers publics des événements (journées portes ouvertes, stages…)
 * exposés par l'API sans authentification.
 *
 * Revalidate court (60 s) : les places restantes affichées sur la landing
 * doivent rester relativement fraîches sans pour autant bypasser le cache.
 */

export interface PublicEventProgramItem {
  id: string;
  timeLabel: string | null;
  title: string;
  description: string | null;
  /** Créneau sélectionnable dans le formulaire d'inscription. */
  bookable: boolean;
  /** Places restantes — null = illimité. */
  remainingSpots: number | null;
  sortOrder: number;
}

export interface PublicClubEvent {
  id: string;
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  priceCents: number | null;
  publicSlug: string;
  publicHeadline: string | null;
  publicDescription: string | null;
  publicCtaLabel: string | null;
  /** Places restantes au niveau de l'événement — null = illimité. */
  remainingSpots: number | null;
  registrationOpen: boolean;
  programItems: PublicEventProgramItem[];
}

const EVENT_FIELDS = /* GraphQL */ `
  id
  title
  location
  startsAt
  endsAt
  priceCents
  publicSlug
  publicHeadline
  publicDescription
  publicCtaLabel
  remainingSpots
  registrationOpen
  programItems {
    id
    timeLabel
    title
    description
    bookable
    remainingSpots
    sortOrder
  }
`;

const LIST_PUBLIC_EVENTS = /* GraphQL */ `
  query PublicClubEvents($clubSlug: String!) {
    publicClubEvents(clubSlug: $clubSlug) {
      ${EVENT_FIELDS}
    }
  }
`;

const GET_PUBLIC_EVENT = /* GraphQL */ `
  query PublicClubEvent($clubSlug: String!, $eventSlug: String!) {
    publicClubEvent(clubSlug: $clubSlug, eventSlug: $eventSlug) {
      ${EVENT_FIELDS}
    }
  }
`;

function sortProgramItems(event: PublicClubEvent): PublicClubEvent {
  return {
    ...event,
    programItems: [...event.programItems].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    ),
  };
}

export async function fetchPublicEvents(
  clubSlug: string,
): Promise<PublicClubEvent[]> {
  const data = await fetchGraphQL<{ publicClubEvents: PublicClubEvent[] }>(
    LIST_PUBLIC_EVENTS,
    { clubSlug },
    { revalidate: 60 },
  );
  return data.publicClubEvents.map(sortProgramItems);
}

/**
 * Détail d'un événement public — null si le slug n'existe pas (l'API
 * throw NotFound, on le convertit en null pour laisser la page faire
 * son `notFound()`).
 */
export async function fetchPublicEvent(
  clubSlug: string,
  eventSlug: string,
): Promise<PublicClubEvent | null> {
  try {
    const data = await fetchGraphQL<{ publicClubEvent: PublicClubEvent }>(
      GET_PUBLIC_EVENT,
      { clubSlug, eventSlug },
      { revalidate: 60 },
    );
    return sortProgramItems(data.publicClubEvent);
  } catch {
    return null;
  }
}
