import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware vitrine — résolution multi-domaine + mode édition, encodés
 * comme segments de route ([host]/[editFlag]) plutôt qu'un header.
 *
 * Pourquoi : lire `headers()`/`cookies()` dans un Server Component désactive
 * tout cache statique/ISR pour la route entière (Next 15 stable, pas de
 * PPR). Le middleware s'exécute avant ce pipeline de rendu — lire le host
 * et le cookie d'édition ici, puis les réécrire comme `params` via
 * `NextResponse.rewrite`, permet aux pages de rester cacheables par
 * combinaison (host, editFlag) au lieu d'être dynamiques sur 100% des
 * requêtes. L'URL visible du visiteur ne change pas (rewrite ≠ redirect).
 *
 * cf. docs/memory/pitfalls (vitrine lente — cache désactivé par headers()).
 */
export function middleware(req: NextRequest): NextResponse {
  const host = req.headers.get('host') ?? '';
  const cookieName =
    process.env.VITRINE_EDIT_COOKIE_NAME ?? 'clubflow_vitrine_edit';
  const editFlag = req.cookies.get(cookieName)?.value ? '1' : '0';

  // ⚠️ "sites" et non "_sites" : Next.js App Router traite tout dossier
  // préfixé par `_` comme un "private folder" exclu du routing — un piège
  // vécu en direct sur ce refactor (0 route enregistrée, 404 sur tout,
  // build "réussi" sans erreur). cf. pitfall vitrine lente.
  const url = req.nextUrl.clone();
  url.pathname = `/sites/${encodeURIComponent(host)}/${editFlag}${req.nextUrl.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    // On exclut les assets Next statiques, les Route Handlers (api/**) et
    // les fichiers de métadonnées qui restent hors du tree [host]/[editFlag].
    '/((?!_next/static|_next/image|favicon.ico|fonts/|public/|api/|robots.txt|sitemap.xml).*)',
  ],
};
