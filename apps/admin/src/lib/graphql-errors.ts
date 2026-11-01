type ErrorLike = {
  extensions?: Record<string, unknown> | null;
};

/**
 * Refus « module non activé » de l'API (`ClubModuleEnabledGuard`) : il dit
 * qu'une fonctionnalité est coupée, pas que le club est inaccessible. Le club
 * actif doit donc rester en place.
 */
export function isModuleDisabledError(error: ErrorLike): boolean {
  const original = error.extensions?.originalError as
    | { reason?: unknown }
    | undefined;
  return original?.reason === 'MODULE_DISABLED';
}

/**
 * Où renvoyer l'administrateur après des erreurs GraphQL :
 * - `login` : jeton expiré ou invalide ;
 * - `select-club` : club refusé (club périmé, appartenance perdue) ;
 * - `null` : rester sur la page, qui affiche son erreur.
 *
 * `MyAdminClubs` n'est pas soumis au contexte de club : un refus sur cette
 * requête ne doit pas boucler vers la page de sélection qui l'appelle.
 */
export function authRedirectFor(
  errors: readonly ErrorLike[],
  operationName: string,
): 'login' | 'select-club' | null {
  const code = (e: ErrorLike) => e.extensions?.code;
  if (
    errors.some((e) => code(e) === 'UNAUTHENTICATED' || code(e) === 'UNAUTHORIZED')
  ) {
    return 'login';
  }
  const clubRefused = errors.some(
    (e) => code(e) === 'FORBIDDEN' && !isModuleDisabledError(e),
  );
  if (clubRefused && operationName !== 'MyAdminClubs') {
    return 'select-club';
  }
  return null;
}
