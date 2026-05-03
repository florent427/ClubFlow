import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware vitrine — résolution multi-domaine légère.
 *
 * Injecte un header `x-vitrine-host` dans la requête pour que
 * `club-resolution.ts` (côté serveur des RSC) puisse lire le hostname sans
 * devoir réimporter `headers()` à chaque appel.
 *
 * En Phase 1 mono-club, VITRINE_DEFAULT_CLUB_SLUG prend le dessus — mais le
 * middleware est déjà en place pour la Phase 2 multi-domaine.
 */
export function middleware(req: NextRequest): NextResponse {
  const host = req.headers.get('host') ?? '';
  const res = NextResponse.next();
  res.headers.set('x-vitrine-host', host);
  return res;
}

export const config = {
  matcher: [
    // On exclut les assets Next statiques et les endpoints internes.
    '/((?!_next/static|_next/image|favicon.ico|fonts/|public/).*)',
  ],
};
