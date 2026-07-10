import {
  ApolloClient,
  ApolloLink,
  HttpLink,
  InMemoryCache,
} from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import { CombinedGraphQLErrors, ServerError } from '@apollo/client/errors';
import { clearAuth, getClubId, getToken } from './storage';

const uri =
  import.meta.env.VITE_GRAPHQL_HTTP ?? 'http://localhost:3000/graphql';

const httpLink = new HttpLink({ uri, credentials: 'include' });

const authLink = new ApolloLink((operation, forward) => {
  const token = getToken();
  const clubId = getClubId();
  operation.setContext(({ headers = {} }: { headers?: Record<string, string> }) => ({
    headers: {
      ...headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(clubId ? { 'x-club-id': clubId } : {}),
    },
  }));
  return forward(operation);
});

/**
 * Lien d'erreur global (absent avant le QA du 2026-07-10, bug C1) :
 * token expiré/invalide → purge de session + redirect /login avec
 * returnTo, au lieu d'un espace membre fantôme truffé d'erreurs brutes.
 * API Apollo v4 : le handler reçoit `{ error }`.
 */
const errorLink = onError(({ error }) => {
  const path = window.location.pathname;
  if (path === '/login' || path === '/select-profile') return;

  const isUnauth =
    (ServerError.is(error) && error.statusCode === 401) ||
    (CombinedGraphQLErrors.is(error) &&
      error.errors.some((e) => {
        const code = (e.extensions?.code as string | undefined) ?? '';
        return code === 'UNAUTHENTICATED' || code === 'UNAUTHORIZED';
      }));

  if (isUnauth) {
    clearAuth();
    const returnTo = encodeURIComponent(
      window.location.pathname + window.location.search,
    );
    window.location.assign(
      `/login?reason=session-expiree&returnTo=${returnTo}`,
    );
  }
});

export const apolloClient = new ApolloClient({
  link: errorLink.concat(authLink).concat(httpLink),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'network-only' },
    query: { fetchPolicy: 'network-only' },
  },
});
