import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';

/**
 * Webhook ISR — invoqué par l'API NestJS quand un contenu vitrine change.
 *
 * Auth : header `X-Revalidate-Secret` qui doit matcher
 * `VITRINE_REVALIDATE_SECRET`. Secret partagé, pas JWT (pas besoin d'identité).
 *
 * Payload :
 *   { paths?: string[], tags?: string[] }
 *
 *  - paths : ['/', '/cours'] → revalidatePath pour chacun
 *  - tags  : ['vitrine:demo-club:index'] → revalidateTag
 *
 * Convention de tags côté fetchers :
 *   vitrine:<clubSlug>:<pageSlug>
 *   vitrine-articles:<clubSlug>
 *   vitrine-article:<clubSlug>:<articleSlug>
 *   vitrine-announcements:<clubSlug>
 *   vitrine-gallery:<clubSlug>
 */

export async function POST(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.VITRINE_REVALIDATE_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: 'VITRINE_REVALIDATE_SECRET non configuré' },
      { status: 500 },
    );
  }
  const given = req.headers.get('x-revalidate-secret');
  if (given !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      paths?: string[];
      tags?: string[];
    };
    const paths = body.paths ?? [];
    const tags = body.tags ?? [];

    for (const p of paths) {
      revalidatePath(p);
    }
    for (const t of tags) {
      revalidateTag(t);
    }

    return NextResponse.json({ ok: true, revalidated: { paths, tags } });
  } catch {
    return NextResponse.json(
      { error: 'JSON invalide' },
      { status: 400 },
    );
  }
}
