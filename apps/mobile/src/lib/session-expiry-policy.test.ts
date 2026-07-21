import { describe, expect, it } from 'vitest';
import { CombinedGraphQLErrors, ServerError } from '@apollo/client/errors';
import { shouldExpireSession } from './session-expiry-policy';

/**
 * Le bug que ces tests ferment : un login raté était traité comme une session
 * expirée. L'errorLink émettait SESSION_EXPIRED_EVENT, App.tsx réinitialisait la
 * navigation vers Login, l'écran se remontait et son message d'erreur — « mot de
 * passe incorrect » — disparaissait avant d'être lu. « Furtif ».
 *
 * `shouldExpireSession` doit donc rendre FALSE pour toute opération d'avant-auth,
 * même sur un vrai 401 : à ce stade il n'y a pas de session à expirer.
 */

/** Fabrique l'erreur réelle qu'Apollo lève sur un UNAUTHENTICATED. */
function unauthenticated(): CombinedGraphQLErrors {
  return new CombinedGraphQLErrors({
    data: null,
    errors: [
      {
        message: 'Identifiants invalides ou compte inaccessible.',
        extensions: { code: 'UNAUTHENTICATED' },
      },
    ],
  });
}

describe('shouldExpireSession', () => {
  it('NE purge PAS la session sur un login raté', () => {
    // Le cœur du correctif. Un 401 sur MemberLogin est un mauvais mot de passe,
    // pas une session morte : l'écran de login garde son erreur affichée.
    expect(shouldExpireSession('MemberLogin', unauthenticated())).toBe(false);
  });

  it('NE purge PAS sur les autres opérations d’avant-auth', () => {
    for (const op of [
      'RegisterContact',
      'RequestPasswordReset',
      'ResetPassword',
      'VerifyEmail',
      'ResendVerification',
    ]) {
      expect(shouldExpireSession(op, unauthenticated())).toBe(false);
    }
  });

  it('PURGE bien sur un 401 d’une opération authentifiée', () => {
    // Le comportement qu'il ne faut SURTOUT pas casser en corrigeant le login
    // (bug QA C1) : un token expiré en cours de session doit ramener au login.
    expect(shouldExpireSession('ViewerShopProducts', unauthenticated())).toBe(
      true,
    );
  });

  it('PURGE sur un ServerError 401 authentifié', () => {
    // `statusCode` dérive de `response.status` (401 ici).
    const err = new ServerError('Unauthorized', {
      response: new Response(null, { status: 401 }),
      bodyText: 'Unauthorized',
    });
    expect(shouldExpireSession('ViewerProfiles', err)).toBe(true);
  });

  it('NE purge PAS sur une erreur qui n’est pas un 401', () => {
    // Une panne réseau ou une erreur métier ne doit pas déconnecter.
    const metier = new CombinedGraphQLErrors({
      data: null,
      errors: [{ message: 'Stock insuffisant', extensions: { code: 'BAD_USER_INPUT' } }],
    });
    expect(shouldExpireSession('ViewerPlaceShopOrder', metier)).toBe(false);
    expect(shouldExpireSession('ViewerProfiles', new Error('Network request failed'))).toBe(
      false,
    );
  });

  it('traite un nom d’opération absent comme AUTHENTIFIÉ', () => {
    // Cas anormal (nos opérations sont toutes nommées) : dans le doute, on ne
    // range pas une opération inconnue parmi l'avant-auth — un 401 réel doit
    // encore pouvoir déconnecter.
    expect(shouldExpireSession(undefined, unauthenticated())).toBe(true);
  });
});
