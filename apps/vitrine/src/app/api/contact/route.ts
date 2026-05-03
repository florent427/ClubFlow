import { NextRequest, NextResponse } from 'next/server';
import { fetchGraphQL } from '@/lib/graphql-client';

/**
 * Route API Next.js qui reçoit la soumission du formulaire de contact et
 * la relaie à la mutation GraphQL publique `submitVitrineContact`.
 *
 * Pourquoi passer par Next plutôt qu'un fetch direct client → API ?
 *  - Permet d'ajouter des protections simples (rate-limit IP, honeypot)
 *    côté edge avant d'aller à l'API NestJS.
 *  - Masque l'URL GraphQL et le `clubSlug` résolu depuis le hostname.
 */

const SUBMIT_CONTACT_MUTATION = /* GraphQL */ `
  mutation SubmitVitrineContact($input: SubmitVitrineContactInput!) {
    submitVitrineContact(input: $input) {
      success
      message
    }
  }
`;

interface MutationResult {
  submitVitrineContact: {
    success: boolean;
    message: string | null;
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as {
      clubSlug?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string | null;
      message?: string;
    };

    const clubSlug =
      (body.clubSlug && body.clubSlug.trim()) ||
      process.env.VITRINE_DEFAULT_CLUB_SLUG;
    if (!clubSlug) {
      return NextResponse.json(
        { error: 'clubSlug manquant' },
        { status: 400 },
      );
    }
    if (!body.email?.trim() || !body.message?.trim()) {
      return NextResponse.json(
        { error: 'E-mail et message requis' },
        { status: 400 },
      );
    }

    const data = await fetchGraphQL<MutationResult>(
      SUBMIT_CONTACT_MUTATION,
      {
        input: {
          clubSlug,
          firstName: body.firstName?.trim() ?? '',
          lastName: body.lastName?.trim() ?? '',
          email: body.email.trim().toLowerCase(),
          phone: body.phone?.trim() || null,
          message: body.message.trim(),
        },
      },
      { revalidate: false },
    );

    if (!data.submitVitrineContact.success) {
      return NextResponse.json(
        { error: data.submitVitrineContact.message ?? 'Échec' },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[vitrine/contact] failed', err);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez plus tard.' },
      { status: 500 },
    );
  }
}
