import { createApolloClient } from '@clubflow/mobile-shared';
import { storage } from './storage';

const uri =
  process.env.EXPO_PUBLIC_GRAPHQL_HTTP ?? 'http://localhost:3000/graphql';

export const apolloClient = createApolloClient({
  uri,
  storage,
  clientId: 'mobile-admin',
  defaultFetchPolicy: 'cache-and-network',
});
