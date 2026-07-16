import { NextRequest, NextResponse } from 'next/server';
import { fetchGraphQL } from '@/lib/graphql-client';
import { resolveCurrentClub } from '@/lib/club-resolution';

/**
 * Route API Next.js qui reçoit l'inscription publique à un événement et la
 * relaie à la mutation GraphQL publique `registerForPublicEvent`.
 *
 * Même pattern que `/api/contact` :
 *  - Honeypot `website` : si rempli (bot), on répond succès sans rien
 *    relayer à l'API.
 *  - Le `clubSlug` est résolu côté serveur depuis le hostname
 *    (multi-tenant), jamais fourni par le client.
 *  - Les messages d'erreur FR de l'API (« Ce créneau est complet… »,
 *    « Choisissez un créneau. », etc.) sont propagés tels quels en 400.
 */

const REGISTER_MUTATION = /* GraphQL */ `
  mutation RegisterForPublicEvent($input: RegisterPublicEventInput!) {
    registerForPublicEvent(input: $input) {
      success
      message
    }
  }
`;

interface MutationResult {
  registerForPublicEvent: {
    success: boolean;
    message: string | null;
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as {
      eventSlug?: string;
      programItemId?: string | null;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string | null;
      note?: string | null;
      website?: string; // honeypot
    };

    // Honeypot rempli → bot. Succès silencieux, aucun appel API.
    if (body.website && body.website.trim().length > 0) {
      return NextResponse.json({ success: true, message: null });
    }

    if (!body.eventSlug?.trim()) {
      return NextResponse.json(
        { error: 'eventSlug manquant' },
        { status: 400 },
      );
    }
    if (
      !body.firstName?.trim() ||
      !body.lastName?.trim() ||
      !body.email?.trim()
    ) {
      return NextResponse.json(
        { error: 'Prénom, nom et e-mail requis.' },
        { status: 400 },
      );
    }

    const club = await resolveCurrentClub();

    const data = await fetchGraphQL<MutationResult>(
      REGISTER_MUTATION,
      {
        input: {
          clubSlug: club.slug,
          eventSlug: body.eventSlug.trim(),
          programItemId: body.programItemId || null,
          firstName: body.firstName.trim(),
          lastName: body.lastName.trim(),
          email: body.email.trim().toLowerCase(),
          phone: body.phone?.trim() || null,
          note: body.note?.trim() || null,
        },
      },
      { revalidate: false },
    );

    const result = data.registerForPublicEvent;
    if (!result.success) {
      return NextResponse.json(
        { error: result.message ?? 'Échec de l’inscription.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ success: true, message: result.message });
  } catch (err) {
    // fetchGraphQL throw avec le message d'erreur GraphQL (FR côté API) —
    // on le propage en 400. Les erreurs transport (HTTP 5xx, réseau)
    // restent des 500 génériques.
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : '';
    const isBusinessError =
      message.length > 0 &&
      !message.startsWith('GraphQL HTTP') &&
      !message.startsWith('Réponse GraphQL') &&
      !message.startsWith('Impossible de résoudre le club');
    if (isBusinessError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error('[vitrine/event-registration] failed', err);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez plus tard.' },
      { status: 500 },
    );
  }
}
