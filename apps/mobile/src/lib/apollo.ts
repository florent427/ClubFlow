import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import * as storage from './storage';

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

export const apolloClient = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'network-only' },
    query: { fetchPolicy: 'network-only' },
  },
});
