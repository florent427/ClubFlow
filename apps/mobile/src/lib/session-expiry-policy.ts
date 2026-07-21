import { CombinedGraphQLErrors, ServerError } from '@apollo/client/errors';

/**
 * Politique : quand une erreur GraphQL doit-elle purger la session (retour
 * Login) ?
 *
 * Module SÉPARÉ d'`apollo.ts` À DESSEIN. `apollo.ts` importe `react-native`
 * (DeviceEventEmitter), que vitest ne sait pas charger — importer la décision
 * depuis là rendait tout test impossible. Ici il n'y a aucune dépendance RN :
 * la règle qui a mordu est donc testable telle quelle.
 */

/**
 * Opérations AVANT authentification : par nature, l'utilisateur n'a pas encore
 * de session. Un 401 sur l'une d'elles n'est PAS une session expirée — c'est un
 * échec métier (mauvais mot de passe, e-mail inconnu, lien périmé) que l'écran
 * concerné affiche lui-même en clair.
 */
export const PRE_AUTH_OPERATIONS = new Set([
  'MemberLogin',
  'RegisterContact',
  'RequestPasswordReset',
  'ResetPassword',
  'VerifyEmail',
  'ResendVerification',
]);

/**
 * Décide si une erreur doit déclencher la purge de session.
 *
 * Corrige le bug de l'erreur « furtive » : un login raté émettait
 * SESSION_EXPIRED_EVENT, App.tsx réinitialisait la navigation vers Login,
 * l'écran se remontait et son message d'erreur disparaissait avant d'être lu.
 *
 * Deux conditions cumulatives :
 *  - l'opération n'est PAS une opération d'avant-auth (sinon l'échec appartient
 *    à l'écran qui l'a lancée) ;
 *  - l'erreur est bien un 401 / UNAUTHENTICATED, pas une panne réseau ni une
 *    erreur métier quelconque.
 */
export function shouldExpireSession(
  operationName: string | undefined,
  error: unknown,
): boolean {
  // `operationName` est nullable en Apollo v4 ; un nom absent (cas anormal, nos
  // opérations sont toutes nommées) suit le traitement normal plutôt que d'être
  // pris pour de l'avant-auth.
  if (operationName != null && PRE_AUTH_OPERATIONS.has(operationName)) {
    return false;
  }
  return (
    (ServerError.is(error) && error.statusCode === 401) ||
    (CombinedGraphQLErrors.is(error) &&
      error.errors.some((e) => {
        const code = (e.extensions?.code as string | undefined) ?? '';
        return code === 'UNAUTHENTICATED' || code === 'UNAUTHORIZED';
      }))
  );
}
