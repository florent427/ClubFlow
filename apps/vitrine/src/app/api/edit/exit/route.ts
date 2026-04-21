import { NextResponse } from 'next/server';

/**
 * Efface le cookie d'édition admin. Appelée par la barre « Quitter l'édition ».
 */
export async function POST(): Promise<NextResponse> {
  const cookieName =
    process.env.VITRINE_EDIT_COOKIE_NAME ?? 'clubflow_vitrine_edit';
  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookieName, '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
    sameSite: 'lax',
  });
  return res;
}
