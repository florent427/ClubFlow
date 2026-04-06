import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import * as storage from './storage';

const uri =
  process.env.EXPO_PUBLIC_GRAPHQL_HTTP ?? 'http://localhost:3000/graphql';

/** Pas de `credentials: 'include'` : inutile avec Bearer et certains stacks RN gèrent mal les cookies. */
const httpLink = new HttpLink({ uri });

const authLink = setContext(async (_, { headers }) => {
  const token = await storage.getToken();
  const clubId = await storage.getClubId();
  const authHeader =
    token && token.length > 0 ? { Authorization: `Bearer ${token}` } : {};
  return {
    headers: {
      ...headers,
      ...authHeader,
      ...(clubId ? { 'x-club-id': clubId } : {}),
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
