import {
  ApolloClient,
  InMemoryCache,
  HttpLink,
  ApolloLink,
} from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import {
  clearActiveClub,
  clearSession,
  getClubId,
  getToken,
} from './storage';

const uri =
  import.meta.env.VITE_GRAPHQL_HTTP ?? 'http://localhost:3000/graphql';

const httpLink = new HttpLink({ uri, credentials: 'include' });

const authLink = new ApolloLink((operation, forward) => {
  const token = getToken();
  const clubId = getClubId();
  operation.setContext(({ headers = {} }) => ({
    headers: {
      ...headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(clubId ? { 'x-club-id': clubId } : {}),
    },
  }));
  return forward(operation);
});

/**
 * Lien d'erreur global :
 * - Détecte UNAUTHORIZED (token expiré/invalide) → clearSession + redirect /login
 * - Détecte FORBIDDEN sur club context (clubId stale, perte de membership)
 *   → clearActiveClub + redirect /select-club (l'utilisateur reste loggué)
 *
 * Ne pas re-rediriger pendant qu'on est déjà sur /login ou /select-club
 * (évite les boucles infinies).
 */
const errorLink = onError(({ graphQLErrors, networkError, operation }) => {
  const path = window.location.pathname;
  const onAuthPage = path === '/login' || path === '/select-club';

  // Erreurs HTTP (network)
  if (networkError && 'statusCode' in networkError) {
    const status = (networkError as { statusCode?: number }).statusCode;
    if (status === 401 && !onAuthPage) {
      clearSession();
      window.location.assign('/login');
      return;
    }
    if (status === 403 && !onAuthPage) {
      // 403 sur opération avec ClubContextGuard probable → clubId stale
      clearActiveClub();
      window.location.assign('/select-club');
      return;
    }
  }

  // Erreurs GraphQL (avec extensions.code Apollo / NestJS)
  if (graphQLErrors?.length) {
    const codes = graphQLErrors.map(
      (e) => (e.extensions?.code as string | undefined) ?? '',
    );
    const isUnauth = codes.some(
      (c) => c === 'UNAUTHENTICATED' || c === 'UNAUTHORIZED',
    );
    const isForbidden = codes.some((c) => c === 'FORBIDDEN');
    const opName = operation.operationName ?? '';

    if (isUnauth && !onAuthPage) {
      clearSession();
      window.location.assign('/login');
      return;
    }
    // FORBIDDEN sur opération nécessitant un club → clubId probablement stale.
    // On exclut MyAdminClubs (qui n'utilise pas ClubContextGuard) pour pas
    // boucler sur la page select-club elle-même.
    if (isForbidden && !onAuthPage && opName !== 'MyAdminClubs') {
      clearActiveClub();
      window.location.assign('/select-club');
      return;
    }
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
