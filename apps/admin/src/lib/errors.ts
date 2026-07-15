/**
 * Traduction des erreurs techniques (Apollo / fetch / NestJS) en messages
 * français présentables. Les erreurs métier de l'API sont déjà en français
 * — on ne traduit que les messages techniques anglais connus.
 *
 * Cf. bug QA M2 : `{error.message}` brut ("Unauthorized", "Failed to
 * fetch") affiché à l'utilisateur dans ~50 endroits.
 */
const KNOWN_MESSAGES: Array<[RegExp, string]> = [
  [/^unauthorized$/i, 'Session expirée ou droits insuffisants. Reconnectez-vous.'],
  [/^forbidden/i, "Vous n'avez pas les droits pour effectuer cette action."],
  [/failed to fetch|networkerror|load failed/i,
    'Connexion au serveur impossible. Vérifiez votre réseau puis réessayez.'],
  [/^response not successful/i,
    'Le serveur a renvoyé une erreur. Réessayez dans un instant.'],
  [/timeout|timed out/i, 'Le serveur met trop de temps à répondre. Réessayez.'],
];

export function frenchError(
  err: unknown,
  fallback = 'Une erreur est survenue. Réessayez.',
): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : '';
  if (!raw) return fallback;
  for (const [pattern, fr] of KNOWN_MESSAGES) {
    if (pattern.test(raw)) return fr;
  }
  return raw;
}

/** Variante contextualisée pour les écrans d'authentification. */
export function frenchAuthError(err: unknown): string {
  return frenchError(err, 'Connexion impossible. Réessayez.');
}
