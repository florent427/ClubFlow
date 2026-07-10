import {
  ApolloClient,
  InMemoryCache,
  HttpLink,
  ApolloLink,
} from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import { CombinedGraphQLErrors, ServerError } from '@apollo/client/errors';
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
 * Lien d'erreur global (API Apollo Client v4 : le handler reçoit `{ error }`,
 * PAS `{ graphQLErrors, networkError }` comme en v3 — l'ancienne signature
 * rendait ce link totalement inopérant, cf. bug QA C1) :
 * - Détecte UNAUTHENTICATED/401 (token expiré/invalide) → clearSession +
 *   redirect /login?returnTo=<page courante> + raison session-expiree.
 * - Détecte FORBIDDEN/403 sur club context (clubId stale, perte de
 *   membership) → clearActiveClub + redirect /select-club (reste loggué).
 *
 * Ne pas re-rediriger pendant qu'on est déjà sur /login ou /select-club
 * (évite les boucles infinies).
 */
const errorLink = onError(({ error, operation }) => {
  const path = window.location.pathname;
  const onAuthPage = path === '/login' || path === '/select-club';
  if (onAuthPage) return;

  const goLogin = () => {
    clearSession();
    const returnTo = encodeURIComponent(
      window.location.pathname + window.location.search,
    );
    window.location.assign(`/login?reason=session-expiree&returnTo=${returnTo}`);
  };

  // Erreurs HTTP brutes (ex. proxy qui répond avant GraphQL)
  if (ServerError.is(error)) {
    if (error.statusCode === 401) {
      goLogin();
      return;
    }
    if (error.statusCode === 403) {
      clearActiveClub();
      window.location.assign('/select-club');
      return;
    }
  }

  // Erreurs GraphQL (avec extensions.code Apollo / NestJS)
  if (CombinedGraphQLErrors.is(error)) {
    const codes = error.errors.map(
      (e) => (e.extensions?.code as string | undefined) ?? '',
    );
    const isUnauth = codes.some(
      (c) => c === 'UNAUTHENTICATED' || c === 'UNAUTHORIZED',
    );
    const isForbidden = codes.some((c) => c === 'FORBIDDEN');
    const opName = operation.operationName ?? '';

    if (isUnauth) {
      goLogin();
      return;
    }
    // FORBIDDEN sur opération nécessitant un club → clubId probablement
    // stale. On exclut MyAdminClubs (qui n'utilise pas ClubContextGuard)
    // pour ne pas boucler sur la page select-club elle-même.
    if (isForbidden && opName !== 'MyAdminClubs') {
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
