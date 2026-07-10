import { DeviceEventEmitter } from 'react-native';
import { createApolloClient } from '@clubflow/mobile-shared';
import { storage } from './storage';

const uri =
  process.env.EXPO_PUBLIC_GRAPHQL_HTTP ?? 'http://localhost:3000/graphql';

/** Événement émis quand l'API répond « token expiré/invalide ». */
export const SESSION_EXPIRED_EVENT = 'clubflow:session-expired';

export const apolloClient = createApolloClient({
  uri,
  storage,
  clientId: 'mobile-admin',
  defaultFetchPolicy: 'cache-and-network',
  // Token expiré → App.tsx purge la session et renvoie sur Login
  // (bug QA C1 : avant, écrans cassés sans issue).
  onUnauthenticated: () => {
    DeviceEventEmitter.emit(SESSION_EXPIRED_EVENT);
  },
});
