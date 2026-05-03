import { createWsClient, type WsClient } from '@clubflow/mobile-shared';
import { storage } from './storage';

const apiBase =
  process.env.EXPO_PUBLIC_API_BASE ?? 'http://localhost:3000';

let cached: WsClient | null = null;

/**
 * Crée (ou réutilise) le client socket.io connecté au namespace /chat.
 * À appeler après login (token + clubId présents).
 */
export async function getOrCreateWs(): Promise<WsClient | null> {
  if (cached) return cached;
  const [token, clubId] = await Promise.all([
    storage.getToken(),
    storage.getClubId(),
  ]);
  if (!token || !clubId) return null;
  cached = createWsClient({ baseUrl: apiBase, token, clubId });
  return cached;
}

export function disconnectWs(): void {
  if (cached) {
    cached.disconnect();
    cached = null;
  }
}
