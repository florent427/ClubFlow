import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { CombinedGraphQLErrors, ServerError } from '@apollo/client/errors';
import { DeviceEventEmitter } from 'react-native';
import * as storage from './storage';

/** Événement émis quand l'API répond « token expiré/invalide ». */
export const SESSION_EXPIRED_EVENT = 'clubflow:session-expired';

const uri =
  process.env.EXPO_PUBLIC_GRAPHQL_HTTP ?? 'http://localhost:3000/graphql';

/** Pas de `credentials: 'include'` : inutile avec Bearer et certains stacks RN gèrent mal les cookies. */
const httpLink = new HttpLink({ uri });

const authLink = setContext(async (_, { headers }) => {
  const token = await storage.getToken();
  // x-club-id fallback : 1) token club id (post-login),
  //                     2) selectedClub.id (pré-login, choisi sur SelectClubScreen).
  // Permet aux queries publiques (clubBranding, clubBySlug) de viser le
  // bon tenant avant que l'utilisateur n'ait un Member/Contact.
  const tokenClubId = await storage.getClubId();
  let effectiveClubId = tokenClubId;
  if (!effectiveClubId) {
    const selected = await storage.getSelectedClub();
    if (selected) effectiveClubId = selected.id;
  }
  const authHeader =
    token && token.length > 0 ? { Authorization: `Bearer ${token}` } : {};
  return {
    headers: {
      ...headers,
      ...authHeader,
      ...(effectiveClubId ? { 'x-club-id': effectiveClubId } : {}),
      'x-clubflow-client': 'mobile',
    },
  };
});

/**
 * Lien d'erreur global (bug QA C1 : aucun errorLink → token expiré =
 * app inutilisable avec erreurs brutes). Sur UNAUTHENTICATED/401, émet
 * SESSION_EXPIRED_EVENT — App.tsx purge la session et renvoie sur Login.
 * API Apollo v4 : le handler reçoit `{ error }`.
 */
let unauthNotified = false;
const errorLink = onError(({ error }) => {
  if (unauthNotified) return;
  const isUnauth =
    (ServerError.is(error) && error.statusCode === 401) ||
    (CombinedGraphQLErrors.is(error) &&
      error.errors.some((e) => {
        const code = (e.extensions?.code as string | undefined) ?? '';
        return code === 'UNAUTHENTICATED' || code === 'UNAUTHORIZED';
      }));
  if (isUnauth) {
    unauthNotified = true;
    DeviceEventEmitter.emit(SESSION_EXPIRED_EVENT);
    setTimeout(() => {
      unauthNotified = false;
    }, 5000);
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
