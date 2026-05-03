import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  VIEWER_CHAT_MESSAGES,
  VIEWER_CHAT_ROOMS,
  VIEWER_CHAT_THREAD_REPLIES,
  VIEWER_POST_CHAT_MESSAGE,
  VIEWER_TOGGLE_CHAT_MESSAGE_REACTION,
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

type ReactionGroup = {
  emoji: string;
  count: number;
  reactedByViewer: boolean;
};

type ChatMessageRow = {
  id: string;
  roomId: string;
  body: string;
  createdAt: string;
  parentMessageId: string | null;
  replyCount: number;
  lastReplyAt: string | null;
  postedByAdmin: boolean;
  sender: {
    id: string;
    pseudo: string | null;
    firstName: string;
    lastName: string;
  };
  reactions: ReactionGroup[];
};

type ChatRoomRow = {
  id: string;
  kind: 'DIRECT' | 'GROUP' | 'COMMUNITY';
  name: string | null;
  description: string | null;
  channelMode: 'OPEN' | 'RESTRICTED' | 'READ_ONLY';
  isBroadcastChannel: boolean;
  archivedAt: string | null;
  updatedAt: string;
  viewerCanPost: boolean;
  viewerCanReply: boolean;
  members: {
    memberId: string;
    role: string;
    member: {
      id: string;
      pseudo: string | null;
      firstName: string;
      lastName: string;
    };
  }[];
};

const QUICK_EMOJIS = [
  '👍',
  '❤️',
  '😂',
  '🎉',
  '🙏',
  '👏',
  '🔥',
  '😍',
  '🤔',
  '😢',
  '😮',
  '🥳',
  '✅',
  '💪',
  '🚀',
  '⭐',
  '🤝',
  '🥋',
  '🤣',
  '😊',
];

export function MessagingPage() {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pseudoDraft, setPseudoDraft] = useState('');
  const [pseudoError, setPseudoError] = useState<string | null>(null);
  const [liveMessages, setLiveMessages] = useState<ChatMessageRow[]>([]);
  /** ID du message dont le fil est ouvert (un seul à la fois). */
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  /** ID du message dont le picker emoji est ouvert. */
  const [reactionPickerForId, setReactionPickerForId] = useState<
    string | null
  >(null);
  /** ID du message auquel on est en train de répondre dans le fil. */
  const [threadDraft, setThreadDraft] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const selectedRoomRef = useRef<string | null>(null);
  selectedRoomRef.current = selectedRoomId;

  const { data: meData } = useQuery<ViewerMeData>(VIEWER_ME);
  const { data: roomsData, refetch: refetchRooms } = useQuery<{
    viewerChatRooms: ChatRoomRow[];
  }>(VIEWER_CHAT_ROOMS);

  const { data: msgData, refetch: refetchMessages } = useQuery<{
    viewerChatMessages: ChatMessageRow[];
  }>(VIEWER_CHAT_MESSAGES, {
    variables: { roomId: selectedRoomId ?? '', beforeMessageId: null },
    skip: !selectedRoomId,
  });

  const { data: threadData, refetch: refetchThread } = useQuery<{
    viewerChatThreadReplies: ChatMessageRow[];
  }>(VIEWER_CHAT_THREAD_REPLIES, {
    variables: {
      roomId: selectedRoomId ?? '',
      parentMessageId: openThreadId ?? '',
    },
    skip: !selectedRoomId || !openThreadId,
  });

  const [postMessage] = useMutation(VIEWER_POST_CHAT_MESSAGE);
  const [toggleReaction] = useMutation(VIEWER_TOGGLE_CHAT_MESSAGE_REACTION);
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
      // Ne pas insérer les réponses en fil dans le flux principal.
      if (
        payload.roomId === selectedRoomRef.current &&
        !payload.parentMessageId
      ) {
        setLiveMessages((prev) => [
          ...prev,
          { ...payload, reactions: payload.reactions ?? [] },
        ]);
      }
      void refetchRooms();
    });
    s.on(
      'chat:reaction',
      (_payload: {
        messageId: string;
        emoji: string;
        count: number;
      }) => {
        void refetchMessages();
        if (openThreadId) void refetchThread();
      },
    );
    s.on(
      'chat:thread',
      (_payload: { parentMessageId: string; replyCount: number }) => {
        void refetchMessages();
      },
    );
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [refetchRooms, refetchMessages, refetchThread, openThreadId]);

  useEffect(() => {
    const s = socketRef.current;
    if (s?.connected && selectedRoomId) {
      s.emit('joinRoom', { roomId: selectedRoomId });
    }
  }, [selectedRoomId]);

  const rooms = roomsData?.viewerChatRooms ?? [];
  const hasPseudo = Boolean(meData?.viewerMe?.pseudo?.trim());
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? null;

  useEffect(() => {
    if (selectedRoomId == null && rooms.length > 0) {
      setSelectedRoomId(rooms[0].id);
    }
  }, [rooms, selectedRoomId]);

  const titleForRoom = useMemo(() => {
    if (!selectedRoom) return '';
    if (selectedRoom.kind === 'COMMUNITY')
      return selectedRoom.name ?? 'Communauté';
    if (selectedRoom.kind === 'GROUP')
      return selectedRoom.name ?? 'Groupe';
    return 'Discussion';
  }, [selectedRoom]);

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

  async function onSendRoot(e: React.FormEvent) {
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
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erreur lors de l’envoi';
      setPseudoError(msg);
    }
  }

  async function onSendReply(parentMessageId: string) {
    if (!selectedRoomId || !threadDraft.trim()) return;
    try {
      await postMessage({
        variables: {
          input: {
            roomId: selectedRoomId,
            body: threadDraft.trim(),
            parentMessageId,
          },
        },
      });
      setThreadDraft('');
      void refetchThread();
      void refetchMessages();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erreur lors de la réponse';
      setPseudoError(msg);
    }
  }

  async function onToggleReaction(messageId: string, emoji: string) {
    try {
      await toggleReaction({
        variables: { input: { messageId, emoji } },
      });
      void refetchMessages();
      if (openThreadId) void refetchThread();
    } catch {
      /* silencieux */
    }
    setReactionPickerForId(null);
  }

  function senderLabel(m: ChatMessageRow): string {
    return m.sender.pseudo ?? m.sender.firstName;
  }

  function lockBanner(): string | null {
    if (!selectedRoom) return null;
    if (selectedRoom.archivedAt) return 'Salon archivé — lecture seule.';
    if (selectedRoom.channelMode === 'READ_ONLY') {
      return 'Salon de diffusion — vous pouvez lire et réagir.';
    }
    if (!selectedRoom.viewerCanPost && selectedRoom.viewerCanReply) {
      return 'Vous ne pouvez pas démarrer un nouveau message dans ce salon, mais vous pouvez répondre en cliquant sur « Répondre » d’un message existant.';
    }
    return null;
  }

  return (
    <div className="mp-messaging">
      <header className="mp-messaging-head">
        <h1 className="mp-page-title">Messagerie</h1>
        <form className="mp-pseudo-form" onSubmit={onSavePseudo}>
          <label>
            <span className="mp-label">
              {hasPseudo
                ? 'Votre pseudo'
                : 'Choisissez un pseudo unique (3 à 32 caractères)'}
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
          <button
            type="submit"
            className="mp-btn mp-btn-secondary"
            disabled={savingPseudo}
          >
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
          Choisissez un pseudo pour participer aux salons. Il sera visible
          des autres membres du club à la place de votre vrai nom.
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
                    r.id === selectedRoomId
                      ? 'mp-room-item active'
                      : 'mp-room-item'
                  }
                  onClick={() => {
                    setSelectedRoomId(r.id);
                    setOpenThreadId(null);
                  }}
                >
                  {r.kind === 'COMMUNITY'
                    ? r.name ?? 'Communauté'
                    : r.kind === 'GROUP'
                      ? r.name ?? 'Groupe'
                      : 'Discussion'}
                  {r.isBroadcastChannel ? (
                    <span className="mp-room-badge">📣</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="mp-messaging-thread">
          <div className="mp-thread-title">
            {titleForRoom || 'Aucun salon sélectionné'}
            {selectedRoom?.description ? (
              <p className="mp-hint mp-thread-desc">
                {selectedRoom.description}
              </p>
            ) : null}
          </div>

          {lockBanner() ? (
            <div className="mp-thread-banner">{lockBanner()}</div>
          ) : null}

          <div className="mp-thread-messages">
            {!selectedRoomId && rooms.length === 0 ? (
              <p className="mp-hint">
                Aucun salon pour l’instant. Le club peut en créer depuis
                l’administration.
              </p>
            ) : !selectedRoomId ? (
              <p className="mp-hint">
                Sélectionnez un salon pour commencer à discuter.
              </p>
            ) : liveMessages.length === 0 ? (
              <p className="mp-hint">
                Aucun message pour l’instant.{' '}
                {selectedRoom?.viewerCanPost ? 'Lancez la discussion !' : ''}
              </p>
            ) : (
              liveMessages.map((m) => (
                <div key={m.id} className="mp-msg">
                  <div className="mp-msg-meta">
                    <strong>{senderLabel(m)}</strong>
                    {m.postedByAdmin ? (
                      <span
                        className="mp-msg-admin-tag"
                        title="Posté par un administrateur du club"
                      >
                        admin
                      </span>
                    ) : null}
                    <span className="mp-msg-time">
                      {new Date(m.createdAt).toLocaleString('fr-FR')}
                    </span>
                  </div>
                  <div className="mp-msg-body">{m.body}</div>

                  {/* Réactions agrégées */}
                  {m.reactions.length > 0 ? (
                    <div className="mp-msg-reactions">
                      {m.reactions.map((r) => (
                        <button
                          key={r.emoji}
                          type="button"
                          className={
                            r.reactedByViewer
                              ? 'mp-react-pill mp-react-pill--mine'
                              : 'mp-react-pill'
                          }
                          onClick={() => void onToggleReaction(m.id, r.emoji)}
                        >
                          <span className="mp-react-emoji">{r.emoji}</span>
                          <span className="mp-react-count">{r.count}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="mp-msg-actions">
                    <button
                      type="button"
                      className="mp-msg-action"
                      onClick={() =>
                        setReactionPickerForId(
                          reactionPickerForId === m.id ? null : m.id,
                        )
                      }
                      aria-label="Ajouter une réaction"
                    >
                      😀 Réagir
                    </button>
                    {selectedRoom?.viewerCanReply ? (
                      <button
                        type="button"
                        className="mp-msg-action"
                        onClick={() => {
                          setOpenThreadId(
                            openThreadId === m.id ? null : m.id,
                          );
                          setThreadDraft('');
                        }}
                      >
                        💬{' '}
                        {m.replyCount > 0
                          ? `${m.replyCount} réponse${m.replyCount > 1 ? 's' : ''}`
                          : 'Répondre'}
                      </button>
                    ) : null}
                  </div>

                  {reactionPickerForId === m.id ? (
                    <div className="mp-react-picker" role="dialog">
                      {QUICK_EMOJIS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          className="mp-react-pick-btn"
                          onClick={() => void onToggleReaction(m.id, e)}
                          aria-label={`Réagir avec ${e}`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {/* Fil de réponses (replié par défaut) */}
                  {openThreadId === m.id ? (
                    <ThreadPanel
                      replies={
                        threadData?.viewerChatThreadReplies ?? []
                      }
                      canReply={Boolean(selectedRoom?.viewerCanReply)}
                      threadDraft={threadDraft}
                      onChangeDraft={setThreadDraft}
                      onSendReply={() => void onSendReply(m.id)}
                      onToggleReaction={onToggleReaction}
                      onClose={() => {
                        setOpenThreadId(null);
                        setThreadDraft('');
                      }}
                    />
                  ) : null}
                </div>
              ))
            )}
          </div>

          {/* Composer racine — caché si lecture seule */}
          {selectedRoom &&
          !selectedRoom.archivedAt &&
          selectedRoom.channelMode !== 'READ_ONLY' ? (
            <form className="mp-thread-compose" onSubmit={onSendRoot}>
              <input
                className="mp-input"
                placeholder={
                  !hasPseudo
                    ? 'Enregistrez un pseudo pour écrire…'
                    : !selectedRoom.viewerCanPost
                      ? 'Écriture désactivée — utilisez « Répondre » sur un message.'
                      : 'Message…'
                }
                value={draft}
                onChange={(ev) => setDraft(ev.target.value)}
                disabled={
                  !selectedRoomId || !hasPseudo || !selectedRoom.viewerCanPost
                }
              />
              <button
                type="submit"
                className="mp-btn"
                disabled={
                  !selectedRoomId ||
                  !hasPseudo ||
                  !selectedRoom.viewerCanPost ||
                  !draft.trim()
                }
              >
                Envoyer
              </button>
            </form>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function ThreadPanel({
  replies,
  canReply,
  threadDraft,
  onChangeDraft,
  onSendReply,
  onToggleReaction,
  onClose,
}: {
  replies: ChatMessageRow[];
  canReply: boolean;
  threadDraft: string;
  onChangeDraft: (v: string) => void;
  onSendReply: () => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="mp-thread-panel">
      <div className="mp-thread-panel-head">
        <strong>Fil de réponses</strong>
        <button
          type="button"
          className="mp-msg-action"
          onClick={onClose}
          aria-label="Fermer le fil"
        >
          ✕
        </button>
      </div>
      {replies.length === 0 ? (
        <p className="mp-hint">Aucune réponse pour l’instant.</p>
      ) : (
        replies.map((r) => (
          <div key={r.id} className="mp-msg mp-msg--reply">
            <div className="mp-msg-meta">
              <strong>{r.sender.pseudo ?? r.sender.firstName}</strong>
              <span className="mp-msg-time">
                {new Date(r.createdAt).toLocaleString('fr-FR')}
              </span>
            </div>
            <div className="mp-msg-body">{r.body}</div>
            {r.reactions.length > 0 ? (
              <div className="mp-msg-reactions">
                {r.reactions.map((rc) => (
                  <button
                    key={rc.emoji}
                    type="button"
                    className={
                      rc.reactedByViewer
                        ? 'mp-react-pill mp-react-pill--mine'
                        : 'mp-react-pill'
                    }
                    onClick={() => onToggleReaction(r.id, rc.emoji)}
                  >
                    <span className="mp-react-emoji">{rc.emoji}</span>
                    <span className="mp-react-count">{rc.count}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))
      )}
      {canReply ? (
        <form
          className="mp-thread-compose mp-thread-compose--inline"
          onSubmit={(e) => {
            e.preventDefault();
            onSendReply();
          }}
        >
          <input
            className="mp-input"
            placeholder="Répondre dans le fil…"
            value={threadDraft}
            onChange={(ev) => onChangeDraft(ev.target.value)}
          />
          <button
            type="submit"
            className="mp-btn"
            disabled={!threadDraft.trim()}
          >
            Répondre
          </button>
        </form>
      ) : null}
    </div>
  );
}
