import { useMutation, useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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
    process.env.EXPO_PUBLIC_GRAPHQL_HTTP ?? 'http://localhost:3000/graphql';
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

function roomLabel(r: ChatRoomRow): string {
  if (r.kind === 'COMMUNITY') return r.name ?? 'Communauté';
  if (r.kind === 'GROUP') return r.name ?? 'Groupe';
  return 'Discussion';
}

export function MessagingScreen() {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pseudoModalOpen, setPseudoModalOpen] = useState(false);
  const [pseudoDraft, setPseudoDraft] = useState('');
  const [pseudoError, setPseudoError] = useState<string | null>(null);
  const [roomsModalOpen, setRoomsModalOpen] = useState(false);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [threadDraft, setThreadDraft] = useState('');
  const [reactionPickerForId, setReactionPickerForId] = useState<
    string | null
  >(null);
  const socketRef = useRef<Socket | null>(null);
  const selectedRoomRef = useRef<string | null>(null);
  selectedRoomRef.current = selectedRoomId;

  const { data: meData } = useQuery<ViewerMeData>(VIEWER_ME);
  const { data: roomsData, refetch: refetchRooms } = useQuery<{
    viewerChatRooms: ChatRoomRow[];
  }>(VIEWER_CHAT_ROOMS, { fetchPolicy: 'cache-and-network' });

  const { data: msgData, refetch: refetchMessages } = useQuery<{
    viewerChatMessages: ChatMessageRow[];
  }>(VIEWER_CHAT_MESSAGES, {
    variables: { roomId: selectedRoomId ?? '', beforeMessageId: null },
    skip: !selectedRoomId,
    fetchPolicy: 'cache-and-network',
  });

  const { data: threadData, refetch: refetchThread } = useQuery<{
    viewerChatThreadReplies: ChatMessageRow[];
  }>(VIEWER_CHAT_THREAD_REPLIES, {
    variables: {
      roomId: selectedRoomId ?? '',
      parentMessageId: openThreadId ?? '',
    },
    skip: !selectedRoomId || !openThreadId,
    fetchPolicy: 'cache-and-network',
  });

  const [postMessage] = useMutation(VIEWER_POST_CHAT_MESSAGE);
  const [toggleReaction] = useMutation(VIEWER_TOGGLE_CHAT_MESSAGE_REACTION);
  const [updatePseudo, { loading: savingPseudo }] = useMutation(
    VIEWER_UPDATE_MY_PSEUDO,
  );

  // Hydrate pseudo draft.
  useEffect(() => {
    if (meData?.viewerMe?.pseudo) {
      setPseudoDraft(meData.viewerMe.pseudo);
    }
  }, [meData?.viewerMe?.pseudo]);

  // Connexion socket.io.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await getToken();
      const clubId = await getClubId();
      if (!token || !clubId || cancelled) return;
      const s = io(`${apiOrigin()}/chat`, {
        auth: { token, clubId },
        transports: ['websocket'],
      });
      socketRef.current = s;
      s.on('chat:message', (payload: ChatMessageRow) => {
        if (
          payload.roomId === selectedRoomRef.current &&
          !payload.parentMessageId
        ) {
          void refetchMessages();
        }
        void refetchRooms();
      });
      s.on('chat:reaction', () => {
        void refetchMessages();
      });
      s.on('chat:thread', () => {
        void refetchMessages();
      });
    })();
    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [refetchMessages, refetchRooms]);

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

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );

  const messages = msgData?.viewerChatMessages ?? [];
  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [messages],
  );

  async function onSavePseudo() {
    setPseudoError(null);
    try {
      await updatePseudo({
        variables: { input: { pseudo: pseudoDraft.trim() } },
      });
      setPseudoModalOpen(false);
      void refetchRooms();
    } catch (err: unknown) {
      setPseudoError(
        err instanceof Error ? err.message : 'Pseudo invalide.',
      );
    }
  }

  async function onSendRoot() {
    if (!selectedRoomId || !draft.trim()) return;
    try {
      await postMessage({
        variables: {
          input: { roomId: selectedRoomId, body: draft.trim() },
        },
      });
      setDraft('');
      void refetchMessages();
    } catch {
      /* silencieux */
    }
  }

  async function onSendReply() {
    if (!selectedRoomId || !openThreadId || !threadDraft.trim()) return;
    try {
      await postMessage({
        variables: {
          input: {
            roomId: selectedRoomId,
            body: threadDraft.trim(),
            parentMessageId: openThreadId,
          },
        },
      });
      setThreadDraft('');
      void refetchThread();
      void refetchMessages();
    } catch {
      /* silencieux */
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

  // -- Rendu --

  if (!hasPseudo) {
    return (
      <View style={styles.center}>
        <Ionicons name="chatbubbles-outline" size={56} color="#1565c0" />
        <Text style={styles.title}>Choisissez un pseudo</Text>
        <Text style={styles.muted}>
          Il sera visible des autres membres à la place de votre vrai nom.
          (3 à 32 caractères)
        </Text>
        <TextInput
          style={styles.input}
          value={pseudoDraft}
          onChangeText={setPseudoDraft}
          placeholder="ex. judoka75"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={32}
        />
        {pseudoError ? (
          <Text style={styles.errorText}>{pseudoError}</Text>
        ) : null}
        <Pressable
          style={[
            styles.btnPrimary,
            (!pseudoDraft.trim() || savingPseudo) && styles.btnDisabled,
          ]}
          disabled={!pseudoDraft.trim() || savingPseudo}
          onPress={() => void onSavePseudo()}
        >
          <Text style={styles.btnPrimaryText}>
            {savingPseudo ? 'Enregistrement…' : 'Enregistrer mon pseudo'}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (rooms.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="chatbubbles-outline" size={56} color="#94a3b8" />
        <Text style={styles.title}>Aucun salon</Text>
        <Text style={styles.muted}>
          Le club peut créer des salons depuis l'administration.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header room sélectionnée */}
      <Pressable
        style={styles.roomHeader}
        onPress={() => setRoomsModalOpen(true)}
      >
        <View style={styles.flex}>
          <Text style={styles.roomTitle}>
            {selectedRoom ? roomLabel(selectedRoom) : '—'}
            {selectedRoom?.isBroadcastChannel ? ' 📣' : ''}
          </Text>
          {selectedRoom?.description ? (
            <Text style={styles.roomDesc} numberOfLines={1}>
              {selectedRoom.description}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-down" size={20} color="#1565c0" />
      </Pressable>

      {/* Bandeau lecture seule / restriction */}
      {selectedRoom?.archivedAt ? (
        <Text style={styles.banner}>Salon archivé — lecture seule.</Text>
      ) : selectedRoom?.channelMode === 'READ_ONLY' ? (
        <Text style={styles.banner}>
          Salon de diffusion — vous pouvez lire et réagir.
        </Text>
      ) : selectedRoom &&
        !selectedRoom.viewerCanPost &&
        selectedRoom.viewerCanReply ? (
        <Text style={styles.banner}>
          Vous ne pouvez pas démarrer un nouveau message ici, mais vous
          pouvez répondre dans le fil d'un message existant (💬).
        </Text>
      ) : null}

      {/* Liste des messages */}
      <FlatList
        style={styles.flex}
        contentContainerStyle={styles.messagesContent}
        data={sortedMessages}
        keyExtractor={(m) => m.id}
        renderItem={({ item: m }) => (
          <View style={styles.msg}>
            <View style={styles.msgMeta}>
              <Text style={styles.msgSender}>
                {m.sender.pseudo ?? m.sender.firstName}
              </Text>
              {m.postedByAdmin ? (
                <Text style={styles.adminTag}>admin</Text>
              ) : null}
              <Text style={styles.msgTime}>
                {new Date(m.createdAt).toLocaleString('fr-FR')}
              </Text>
            </View>
            <Text style={styles.msgBody}>{m.body}</Text>
            {m.reactions.length > 0 ? (
              <View style={styles.reactionsRow}>
                {m.reactions.map((r) => (
                  <Pressable
                    key={r.emoji}
                    onPress={() => void onToggleReaction(m.id, r.emoji)}
                    style={[
                      styles.reactionPill,
                      r.reactedByViewer && styles.reactionPillMine,
                    ]}
                  >
                    <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                    <Text style={styles.reactionCount}>{r.count}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.msgActionsRow}>
              <Pressable
                style={styles.msgAction}
                onPress={() => setReactionPickerForId(m.id)}
              >
                <Ionicons name="happy-outline" size={16} color="#475569" />
                <Text style={styles.msgActionText}>Réagir</Text>
              </Pressable>
              {selectedRoom?.viewerCanReply ? (
                <Pressable
                  style={styles.msgAction}
                  onPress={() => {
                    setOpenThreadId(m.id);
                    setThreadDraft('');
                  }}
                >
                  <Ionicons
                    name="chatbubble-outline"
                    size={16}
                    color="#475569"
                  />
                  <Text style={styles.msgActionText}>
                    {m.replyCount > 0
                      ? `${m.replyCount} réponse${m.replyCount > 1 ? 's' : ''}`
                      : 'Répondre'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            Aucun message pour l'instant.
          </Text>
        }
      />

      {/* Composer racine */}
      {selectedRoom &&
      !selectedRoom.archivedAt &&
      selectedRoom.channelMode !== 'READ_ONLY' ? (
        <View style={styles.composer}>
          <TextInput
            style={styles.composerInput}
            value={draft}
            onChangeText={setDraft}
            placeholder={
              selectedRoom.viewerCanPost
                ? 'Message…'
                : 'Écriture désactivée — utilisez Répondre.'
            }
            multiline
            editable={selectedRoom.viewerCanPost}
          />
          <Pressable
            style={[
              styles.sendBtn,
              (!draft.trim() || !selectedRoom.viewerCanPost) &&
                styles.btnDisabled,
            ]}
            onPress={() => void onSendRoot()}
            disabled={!draft.trim() || !selectedRoom.viewerCanPost}
          >
            <Ionicons name="send" size={18} color="white" />
          </Pressable>
        </View>
      ) : null}

      {/* Modal sélecteur de salon */}
      <Modal
        visible={roomsModalOpen}
        animationType="slide"
        onRequestClose={() => setRoomsModalOpen(false)}
        presentationStyle="pageSheet"
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Salons</Text>
          <Pressable onPress={() => setRoomsModalOpen(false)}>
            <Ionicons name="close" size={24} color="#1565c0" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody}>
          {rooms.map((r) => (
            <Pressable
              key={r.id}
              style={[
                styles.roomItem,
                r.id === selectedRoomId && styles.roomItemActive,
              ]}
              onPress={() => {
                setSelectedRoomId(r.id);
                setRoomsModalOpen(false);
              }}
            >
              <Text style={styles.roomItemTitle}>
                {roomLabel(r)}
                {r.isBroadcastChannel ? '  📣' : ''}
              </Text>
              {r.description ? (
                <Text style={styles.roomItemDesc} numberOfLines={2}>
                  {r.description}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      </Modal>

      {/* Modal thread (réponses) */}
      <Modal
        visible={openThreadId !== null}
        animationType="slide"
        onRequestClose={() => {
          setOpenThreadId(null);
          setThreadDraft('');
        }}
        presentationStyle="pageSheet"
      >
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Fil de réponses</Text>
            <Pressable
              onPress={() => {
                setOpenThreadId(null);
                setThreadDraft('');
              }}
            >
              <Ionicons name="close" size={24} color="#1565c0" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {(threadData?.viewerChatThreadReplies ?? []).length === 0 ? (
              <Text style={styles.muted}>
                Aucune réponse pour l'instant.
              </Text>
            ) : null}
            {(threadData?.viewerChatThreadReplies ?? []).map((r) => (
              <View key={r.id} style={[styles.msg, styles.msgReply]}>
                <View style={styles.msgMeta}>
                  <Text style={styles.msgSender}>
                    {r.sender.pseudo ?? r.sender.firstName}
                  </Text>
                  {r.postedByAdmin ? (
                    <Text style={styles.adminTag}>admin</Text>
                  ) : null}
                  <Text style={styles.msgTime}>
                    {new Date(r.createdAt).toLocaleString('fr-FR')}
                  </Text>
                </View>
                <Text style={styles.msgBody}>{r.body}</Text>
                {r.reactions.length > 0 ? (
                  <View style={styles.reactionsRow}>
                    {r.reactions.map((rc) => (
                      <Pressable
                        key={rc.emoji}
                        onPress={() => void onToggleReaction(r.id, rc.emoji)}
                        style={[
                          styles.reactionPill,
                          rc.reactedByViewer && styles.reactionPillMine,
                        ]}
                      >
                        <Text style={styles.reactionEmoji}>{rc.emoji}</Text>
                        <Text style={styles.reactionCount}>{rc.count}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </ScrollView>
          {selectedRoom?.viewerCanReply ? (
            <View style={styles.composer}>
              <TextInput
                style={styles.composerInput}
                value={threadDraft}
                onChangeText={setThreadDraft}
                placeholder="Répondre dans le fil…"
                multiline
              />
              <Pressable
                style={[
                  styles.sendBtn,
                  !threadDraft.trim() && styles.btnDisabled,
                ]}
                onPress={() => void onSendReply()}
                disabled={!threadDraft.trim()}
              >
                <Ionicons name="send" size={18} color="white" />
              </Pressable>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal picker emoji */}
      <Modal
        visible={reactionPickerForId !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setReactionPickerForId(null)}
      >
        <Pressable
          style={styles.emojiBackdrop}
          onPress={() => setReactionPickerForId(null)}
        >
          <Pressable
            style={styles.emojiSheet}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.emojiSheetTitle}>Réagir</Text>
            <View style={styles.emojiGrid}>
              {QUICK_EMOJIS.map((e) => (
                <Pressable
                  key={e}
                  style={styles.emojiBtn}
                  onPress={() => {
                    if (reactionPickerForId) {
                      void onToggleReaction(reactionPickerForId, e);
                    }
                  }}
                >
                  <Text style={styles.emojiBtnText}>{e}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 8,
  },
  muted: {
    color: '#64748b',
    textAlign: 'center',
    fontSize: 14,
  },
  errorText: { color: '#dc2626', fontSize: 13 },
  input: {
    width: '100%',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
  },
  btnPrimary: {
    backgroundColor: '#1565c0',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  btnPrimaryText: { color: 'white', fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.5 },

  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  roomTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  roomDesc: { fontSize: 12, color: '#64748b', marginTop: 2 },

  banner: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 13,
    color: '#78350f',
  },

  messagesContent: { padding: 16, gap: 10 },
  emptyText: {
    color: '#94a3b8',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 32,
  },

  msg: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
  },
  msgReply: { marginLeft: 16, backgroundColor: '#f1f5f9' },
  msgMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  msgSender: { fontWeight: '700', color: '#1e293b', fontSize: 14 },
  msgTime: { color: '#64748b', fontSize: 11, marginLeft: 'auto' },
  msgBody: {
    marginTop: 6,
    color: '#0f172a',
    fontSize: 15,
    lineHeight: 21,
  },
  adminTag: {
    backgroundColor: '#1e3a8a',
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },

  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  reactionPillMine: {
    backgroundColor: '#dbeafe',
    borderColor: '#93c5fd',
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 12, fontWeight: '700', color: '#1e293b' },

  msgActionsRow: { flexDirection: 'row', gap: 14, marginTop: 8 },
  msgAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  msgActionText: { color: '#475569', fontSize: 12 },

  composer: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  composerInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 15,
  },
  sendBtn: {
    backgroundColor: '#1565c0',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  modalBody: { padding: 16, gap: 8 },

  roomItem: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 14,
  },
  roomItemActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#1565c0',
  },
  roomItemTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  roomItemDesc: { fontSize: 13, color: '#64748b', marginTop: 4 },

  emojiBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  emojiSheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
  },
  emojiSheetTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 12,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-around',
  },
  emojiBtn: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiBtnText: { fontSize: 28 },
});
