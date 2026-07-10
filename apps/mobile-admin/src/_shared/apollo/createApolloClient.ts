import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { CombinedGraphQLErrors, ServerError } from '@apollo/client/errors';
import type { AppStorage } from '../storage/createStorage';

export type ClientId = 'mobile' | 'mobile-admin';

export type CreateApolloClientOptions = {
  uri: string;
  storage: AppStorage;
  /** Identifie l'app dans l'header `x-clubflow-client`. */
  clientId: ClientId;
  /**
   * Override defaultOptions. Pour mobile-admin on peut passer
   * cache-and-network pour profiter du cache persist.
   */
  defaultFetchPolicy?: 'network-only' | 'cache-and-network' | 'cache-first';
  /**
   * Appelé quand l'API répond UNAUTHENTICATED/401 (token expiré ou
   * invalide) — l'app hôte purge sa session et renvoie vers Login.
   * Sans ce hook, un token expiré rendait l'app inutilisable avec des
   * erreurs brutes (bug QA C1).
   */
  onUnauthenticated?: () => void;
};

/**
 * Factory Apollo Client. Réutilisée par mobile (member) et mobile-admin.
 *
 * Headers : `Authorization: Bearer <token>`, `x-club-id: <clubId>`,
 * `x-clubflow-client: <clientId>`.
 */
export function createApolloClient({
  uri,
  storage,
  clientId,
  defaultFetchPolicy = 'network-only',
  onUnauthenticated,
}: CreateApolloClientOptions) {
  const httpLink = new HttpLink({ uri });

  // Débounce simple : plusieurs queries peuvent échouer en rafale au
  // moment où le token expire — on ne notifie l'app qu'une fois.
  let unauthNotified = false;
  const errorLink = onError(({ error }) => {
    if (!onUnauthenticated || unauthNotified) return;
    const isUnauth =
      (ServerError.is(error) && error.statusCode === 401) ||
      (CombinedGraphQLErrors.is(error) &&
        error.errors.some((e) => {
          const code = (e.extensions?.code as string | undefined) ?? '';
          return code === 'UNAUTHENTICATED' || code === 'UNAUTHORIZED';
        }));
    if (isUnauth) {
      unauthNotified = true;
      onUnauthenticated();
      // Réarme après un délai : si l'app ne se déconnecte pas (ex. écran
      // déjà sur Login), on pourra re-signaler plus tard.
      setTimeout(() => {
        unauthNotified = false;
      }, 5000);
    }
  });

  const authLink = setContext(async (_, { headers }) => {
    const [token, clubId] = await Promise.all([
      storage.getToken(),
      storage.getClubId(),
    ]);
    const authHeader =
      token && token.length > 0 ? { Authorization: `Bearer ${token}` } : {};
    return {
      headers: {
        ...headers,
        ...authHeader,
        ...(clubId ? { 'x-club-id': clubId } : {}),
        'x-clubflow-client': clientId,
      },
    };
  });

  // Note : Apollo distingue WatchQueryFetchPolicy (qui inclut cache-and-network)
  // de FetchPolicy (qui ne l'inclut pas). On adapte pour la query simple.
  const queryFetchPolicy =
    defaultFetchPolicy === 'cache-and-network'
      ? 'cache-first'
      : defaultFetchPolicy;

  return new ApolloClient({
    link: errorLink.concat(authLink).concat(httpLink),
    cache: new InMemoryCache(),
    defaultOptions: {
      watchQuery: { fetchPolicy: defaultFetchPolicy },
      query: { fetchPolicy: queryFetchPolicy },
    },
  });
}
