import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  VIEWER_CHAT_MESSAGES,
  VIEWER_CHAT_ROOMS,
  VIEWER_POST_CHAT_MESSAGE,
  VIEWER_UPDATE_MY_PSEUDO,
} from '../lib/messaging-documents';
import { VIEWER_ME } from '../lib/viewer-documents';
import { getClubId, getToken } from '../lib/storage';

import type { ViewerMeData } from '../lib/viewer-types';

function apiOrigin(): string {
  const u =
    import.meta.env.VITE_GRAPHQL_HTTP ?? 'http://localhost:3000/graphql';
  return u.replace(/\/graphql\/?$/, '') || 'http://localhost:3000';
}

type ChatMessageRow = {
  id: string;
  roomId: string;
  body: string;
  createdAt: string;
  sender: {
    id: string;
    pseudo: string | null;
    firstName: string;
    lastName: string;
  };
};

export function MessagingPage() {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pseudoDraft, setPseudoDraft] = useState('');
  const [pseudoError, setPseudoError] = useState<string | null>(null);
  const [liveMessages, setLiveMessages] = useState<ChatMessageRow[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const selectedRoomRef = useRef<string | null>(null);
  selectedRoomRef.current = selectedRoomId;

  const { data: meData } = useQuery<ViewerMeData>(VIEWER_ME);
  const { data: roomsData, refetch: refetchRooms } = useQuery<{
    viewerChatRooms: Array<{
      id: string;
      kind: string;
      name: string | null;
      updatedAt: string;
    }>;
  }>(VIEWER_CHAT_ROOMS);

  const { data: msgData, refetch: refetchMessages } = useQuery<{
    viewerChatMessages: ChatMessageRow[];
  }>(VIEWER_CHAT_MESSAGES, {
    variables: { roomId: selectedRoomId ?? '', beforeMessageId: null },
    skip: !selectedRoomId,
  });

  const [postMessage] = useMutation(VIEWER_POST_CHAT_MESSAGE);
  const [updatePseudo, { loading: savingPseudo }] = useMutation(
    VIEWER_UPDATE_MY_PSEUDO,
  );

  useEffect(() => {
    if (meData?.viewerMe?.pseudo) {
      setPseudoDraft(meData.viewerMe.pseudo);
    }
  }, [meData?.viewerMe?.pseudo]);

  useEffect(() => {
    const rows = msgData?.viewerChatMessages ?? [];
    setLiveMessages([...rows].reverse());
  }, [msgData]);

  useEffect(() => {
    const token = getToken();
    const clubId = getClubId();
    if (!token || !clubId) return;
    const s = io(`${apiOrigin()}/chat`, {
      auth: { token, clubId },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = s;
    s.on('chat:message', (payload: ChatMessageRow) => {
      if (payload.roomId === selectedRoomRef.current) {
        setLiveMessages((prev) => [...prev, payload]);
      }
      void refetchRooms();
    });
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [refetchRooms]);

  useEffect(() => {
    const s = socketRef.current;
    if (s?.connected && selectedRoomId) {
      s.emit('joinRoom', { roomId: selectedRoomId });
    }
  }, [selectedRoomId]);

  const rooms = roomsData?.viewerChatRooms ?? [];
  const hasPseudo = Boolean(meData?.viewerMe?.pseudo?.trim());

  useEffect(() => {
    if (selectedRoomId == null && rooms.length > 0) {
      setSelectedRoomId(rooms[0].id);
    }
  }, [rooms, selectedRoomId]);

  const titleForRoom = useMemo(() => {
    if (!selectedRoomId) return '';
    const r = rooms.find((x) => x.id === selectedRoomId);
    if (!r) return '';
    if (r.kind === 'COMMUNITY') return r.name ?? 'Communauté';
    if (r.kind === 'GROUP') return r.name ?? 'Groupe';
    return 'Discussion';
  }, [rooms, selectedRoomId]);

  async function onSavePseudo(e: React.FormEvent) {
    e.preventDefault();
    setPseudoError(null);
    try {
      await updatePseudo({
        variables: { input: { pseudo: pseudoDraft.trim() } },
      });
      void refetchRooms();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Impossible de mettre à jour le pseudo.';
      setPseudoError(msg);
    }
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRoomId || !draft.trim()) return;
    try {
      await postMessage({
        variables: {
          input: { roomId: selectedRoomId, body: draft.trim() },
        },
      });
      setDraft('');
      void refetchMessages();
      void refetchRooms();
    } catch {
      /* toast optionnel */
    }
  }

  return (
    <div className="mp-messaging">
      <header className="mp-messaging-head">
        <h1 className="mp-page-title">Messagerie</h1>
        <form className="mp-pseudo-form" onSubmit={onSavePseudo}>
          <label>
            <span className="mp-label">
              {hasPseudo ? 'Votre pseudo' : 'Choisissez un pseudo unique (3 à 32 caractères)'}
            </span>
            <input
              className="mp-input"
              value={pseudoDraft}
              onChange={(ev) => setPseudoDraft(ev.target.value)}
              disabled={savingPseudo}
              minLength={3}
              maxLength={32}
              autoComplete="off"
              placeholder={hasPseudo ? undefined : 'ex. judoka75'}
            />
          </label>
          <button type="submit" className="mp-btn mp-btn-secondary" disabled={savingPseudo}>
            Enregistrer
          </button>
          {pseudoError ? (
            <span className="mp-err" role="alert">
              {pseudoError}
            </span>
          ) : null}
        </form>
      </header>
      {!hasPseudo ? (
        <p className="mp-hint">
          Choisissez un pseudo pour participer aux salons. Il sera visible des autres
          membres du club à la place de votre vrai nom.
        </p>
      ) : null}

      <div className="mp-messaging-grid">
        <aside className="mp-messaging-rooms">
          <h2 className="mp-sidebar-title">Salons</h2>
          <ul className="mp-room-list">
            {rooms.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className={
                    r.id === selectedRoomId ? 'mp-room-item active' : 'mp-room-item'
                  }
                  onClick={() => setSelectedRoomId(r.id)}
                >
                  {r.kind === 'COMMUNITY'
                    ? r.name ?? 'Communauté'
                    : r.kind === 'GROUP'
                      ? r.name ?? 'Groupe'
                      : 'Discussion'}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="mp-messaging-thread">
          <div className="mp-thread-title">{titleForRoom || 'Aucun salon sélectionné'}</div>
          <div className="mp-thread-messages">
            {!selectedRoomId && rooms.length === 0 ? (
              <p className="mp-hint">
                Aucun salon pour l’instant. Le club peut en créer depuis l’administration.
              </p>
            ) : !selectedRoomId ? (
              <p className="mp-hint">Sélectionnez un salon pour commencer à discuter.</p>
            ) : liveMessages.length === 0 ? (
              <p className="mp-hint">Aucun message pour l’instant. Lancez la discussion !</p>
            ) : (
              liveMessages.map((m) => (
                <div key={m.id} className="mp-msg">
                  <div className="mp-msg-meta">
                    <strong>{m.sender.pseudo ?? `${m.sender.firstName}`}</strong>
                    <span className="mp-msg-time">
                      {new Date(m.createdAt).toLocaleString('fr-FR')}
                    </span>
                  </div>
                  <div className="mp-msg-body">{m.body}</div>
                </div>
              ))
            )}
          </div>
          <form className="mp-thread-compose" onSubmit={onSend}>
            <input
              className="mp-input"
              placeholder={
                !hasPseudo
                  ? 'Enregistrez un pseudo pour écrire…'
                  : !selectedRoomId
                    ? 'Sélectionnez un salon…'
                    : 'Message…'
              }
              value={draft}
              onChange={(ev) => setDraft(ev.target.value)}
              disabled={!selectedRoomId || !hasPseudo}
            />
            <button
              type="submit"
              className="mp-btn"
              disabled={!selectedRoomId || !hasPseudo || !draft.trim()}
            >
              Envoyer
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
