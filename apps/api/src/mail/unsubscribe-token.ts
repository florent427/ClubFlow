import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Jeton de désinscription d'une campagne.
 *
 * Il voyage dans l'en-tête `List-Unsubscribe` de chaque campagne et vit aussi
 * longtemps que le message : une boîte mail garde des années d'archives, et un
 * lien de désinscription qui expire est pire que pas de lien. Il n'ouvre donc
 * rien d'autre que l'ajout de CETTE adresse à la liste de suppression de CE
 * club : ni lecture, ni session, ni autre club.
 *
 * Signé en HMAC-SHA256 : sans le secret du serveur, on ne peut pas désinscrire
 * l'adresse de quelqu'un d'autre.
 */
export type UnsubscribeClaim = { clubId: string; email: string };

const VERSION = 'u1';

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

function b64url(value: Buffer | string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromB64url(value: string): Buffer {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  return Buffer.from(
    value.replace(/-/g, '+').replace(/_/g, '/') + pad,
    'base64',
  );
}

function sign(payload: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(payload).digest());
}

export function buildUnsubscribeToken(
  claim: UnsubscribeClaim,
  secret: string,
): string {
  const payload = b64url(
    JSON.stringify({
      v: VERSION,
      c: claim.clubId,
      e: normalize(claim.email),
    }),
  );
  return `${payload}.${sign(payload, secret)}`;
}

/** La revendication portée par ce jeton, ou `null` s'il ne tient pas. */
export function readUnsubscribeToken(
  token: string,
  secret: string,
): UnsubscribeClaim | null {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  const [payload, signature] = parts;
  const attendu = Buffer.from(sign(payload, secret));
  const recu = Buffer.from(signature);
  // Comparaison à durée constante : la longueur d'abord, sinon timingSafeEqual
  // lève au lieu de répondre faux.
  if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) {
    return null;
  }
  try {
    const data = JSON.parse(fromB64url(payload).toString('utf8')) as {
      v?: string;
      c?: string;
      e?: string;
    };
    if (data.v !== VERSION || !data.c || !data.e) {
      return null;
    }
    return { clubId: data.c, email: data.e };
  } catch {
    return null;
  }
}

/**
 * Secret de signature. `MAIL_UNSUBSCRIBE_SECRET` d'abord ; à défaut celui de
 * la vérification d'e-mail, sinon celui des jetons de session — même chaîne
 * que `EmailVerificationService`, car les serveurs ne posent en pratique que
 * `JWT_SECRET`. Un secret emprunté est toujours dérivé : un jeton de
 * désinscription ne vaut jamais jeton de session, ni l'inverse.
 *
 * Sans aucun des trois, pas de jeton : la campagne part alors sans lien de
 * désinscription plutôt que de refuser de partir.
 */
export function unsubscribeSecret(): string | null {
  const dedie = process.env.MAIL_UNSUBSCRIBE_SECRET?.trim();
  if (dedie) {
    return dedie;
  }
  const emprunte =
    process.env.EMAIL_VERIFICATION_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim();
  return emprunte ? `unsubscribe:${emprunte}` : null;
}
