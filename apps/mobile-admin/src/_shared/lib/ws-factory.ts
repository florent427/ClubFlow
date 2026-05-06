import { io, type Socket } from 'socket.io-client';

export type WsClient = {
  socket: Socket;
  joinRoom: (roomId: string) => void;
  leaveRoom: (roomId: string) => void;
  on: (event: string, handler: (...args: unknown[]) => void) => () => void;
  disconnect: () => void;
};

export type CreateWsOptions = {
  /** URL de base, ex : "wss://api.clubflow.local" ou "http://localhost:3000". */
  baseUrl: string;
  token: string;
  clubId: string;
  /** Namespace, default `/chat`. */
  namespace?: string;
};

/**
 * Factory socket.io client pour la messagerie. Gère auth (token + clubId)
 * et expose des helpers join/leave/on.
 */
export function createWsClient({
  baseUrl,
  token,
  clubId,
  namespace = '/chat',
}: CreateWsOptions): WsClient {
  const url = `${baseUrl.replace(/\/$/, '')}${namespace}`;
  const socket = io(url, {
    auth: { token, clubId },
    transports: ['websocket'],
    autoConnect: true,
  });

  return {
    socket,
    joinRoom: (roomId: string) => {
      socket.emit('joinRoom', { roomId });
    },
    leaveRoom: (roomId: string) => {
      socket.emit('leaveRoom', { roomId });
    },
    on: (event, handler) => {
      socket.on(event, handler);
      return () => {
        socket.off(event, handler);
      };
    },
    disconnect: () => {
      socket.disconnect();
    },
  };
}
