import { NextRequest, NextResponse } from 'next/server';

/**
 * Pose le cookie d'édition sur le domaine courant.
 *
 * Usage : l'admin clique sur « Modifier le site » dans le back-office, qui
 * redirige vers `<vitrine>/api/edit/enter?token=<jwt>&redirect=/cours`. Cette
 * route pose le cookie httpOnly et redirige vers la page demandée (le cookie
 * n'est pas accessible au JS — seul le middleware serveur le lit).
 *
 * Sécurité Phase 1 : on pose le cookie sans vérifier le JWT localement ; la
 * vérification cryptographique complète est faite par l'API à chaque mutation
 * (cookie envoyé via Authorization header). Une prochaine itération ajoutera
 * une vérif locale avec VITRINE_JWT_SECRET pour refuser immédiatement un
 * token malformé.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const redirect = url.searchParams.get('redirect') ?? '/';
  if (!token) {
    return NextResponse.json({ error: 'token manquant' }, { status: 400 });
  }
  const cookieName =
    process.env.VITRINE_EDIT_COOKIE_NAME ?? 'clubflow_vitrine_edit';
  const res = NextResponse.redirect(new URL(redirect, req.url));
  res.cookies.set(cookieName, token, {
    path: '/',
    maxAge: 60 * 30, // 30 min
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
