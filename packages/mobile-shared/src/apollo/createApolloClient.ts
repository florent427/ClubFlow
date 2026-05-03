import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
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
}: CreateApolloClientOptions) {
  const httpLink = new HttpLink({ uri });

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
    link: authLink.concat(httpLink),
    cache: new InMemoryCache(),
    defaultOptions: {
      watchQuery: { fetchPolicy: defaultFetchPolicy },
      query: { fetchPolicy: queryFetchPolicy },
    },
  });
}
