import {
  ApolloClient,
  ApolloLink,
  HttpLink,
  InMemoryCache,
} from '@apollo/client';
import { getClubId, getToken } from './storage';

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

export const apolloClient = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'network-only' },
    query: { fetchPolicy: 'network-only' },
  },
});
