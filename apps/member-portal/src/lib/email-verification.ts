/**
 * Reconnaît le refus de connexion « adresse pas encore vérifiée », pour
 * proposer le renvoi du lien au moment où l'adhérent est bloqué.
 *
 * Le message vient de l'API (`auth.service.ts`). On compare sur une forme
 * normalisée : l'apostrophe typographique et les accents varient d'un canal à
 * l'autre, et un lien mort au bout de 48 h ne doit pas dépendre de ça.
 */
export function isUnverifiedEmailError(message: string | null | undefined): boolean {
  if (!message) {
    return false;
  }
  const norm = message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ');
  return /pas encore verifiee/.test(norm);
}

/** Adresse exploitable pour un renvoi : non vide et vaguement une adresse. */
export function canResendVerification(email: string): boolean {
  const norm = email.trim();
  return norm.length >= 5 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(norm);
}
