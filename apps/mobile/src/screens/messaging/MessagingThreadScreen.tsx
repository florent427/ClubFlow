import { useMutation, useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
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
import { LinearGradient } from 'expo-linear-gradient';
import { io, type Socket } from 'socket.io-client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../../components/ui';
import {
  VIEWER_CHAT_MESSAGES,
  VIEWER_CHAT_ROOMS,
  VIEWER_CHAT_THREAD_REPLIES,
  VIEWER_POST_CHAT_MESSAGE,
  VIEWER_TOGGLE_CHAT_MESSAGE_REACTION,
} from '../../lib/messaging-documents';
import {
  authorColor,
  formatBubbleTime,
  formatThreadSeparatorDate,
  initials,
} from '../../lib/messaging-format';
import { getClubId, getToken } from '../../lib/storage';
import { palette, radius, shadow, spacing, typography } from '../../lib/theme';
import { useClubTheme } from '../../lib/theme-context';
import { VIEWER_ME } from '../../lib/viewer-documents';
import type { ViewerMeData } from '../../lib/viewer-types';
import {
  QUICK_EMOJIS,
  roomLabel,
  type ChatMessageRow,
  type ChatRoomRow,
  type MessagingStackParamList,
} from './types';

function apiOrigin(): string {
  const u =
    process.env.EXPO_PUBLIC_GRAPHQL_HTTP ?? 'http://localhost:3000/graphql';
  return u.replace(/\/graphql\/?$/, '') || 'http://localhost:3000';
}

type Props = NativeStackScreenProps<MessagingStackParamList, 'MessagingThread'>;

/**
 * Type d'élément affiché dans la FlatList — soit un message, soit un
 * séparateur de date centré ("Aujourd'hui", "Hier", "Lundi", date complète).
 */
type ListItem =
  | { kind: 'msg'; msg: ChatMessageRow; showAuthor: boolean }
  | { kind: 'date'; key: string; label: string };

export function MessagingThreadScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<MessagingStackParamList>>();
  const clubTheme = useClubTheme();
  const primary = clubTheme.isClubBranded
    ? clubTheme.palette.primary
    : palette.primary;

  const { roomId } = route.params;
  const [draft, setDraft] = useState('');
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [threadDraft, setThreadDraft] = useState('');
  const [reactionPickerForId, setReactionPickerForId] = useState<
    string | null
  >(null);
  const socketRef = useRef<Socket | null>(null);
  const flatListRef = useRef<FlatList<ListItem> | null>(null);

  const { data: meData } = useQuery<ViewerMeData>(VIEWER_ME);
  const viewerMemberId = meData?.viewerMe?.id ?? null;

  const { data: roomsData } = useQuery<{
    viewerChatRooms: ChatRoomRow[];
  }>(VIEWER_CHAT_ROOMS);
  const room = useMemo(
    () => roomsData?.viewerChatRooms?.find((r) => r.id === roomId) ?? null,
    [roomsData, roomId],
  );

  const { data: msgData, refetch: refetchMessages } = useQuery<{
    viewerChatMessages: ChatMessageRow[];
  }>(VIEWER_CHAT_MESSAGES, {
    variables: { roomId, beforeMessageId: null },
    fetchPolicy: 'cache-and-network',
  });

  const { data: threadData, refetch: refetchThread } = useQuery<{
    viewerChatThreadReplies: ChatMessageRow[];
  }>(VIEWER_CHAT_THREAD_REPLIES, {
    variables: { roomId, parentMessageId: openThreadId ?? '' },
    skip: !openThreadId,
    fetchPolicy: 'cache-and-network',
  });

  const [postMessage] = useMutation(VIEWER_POST_CHAT_MESSAGE);
  const [toggleReaction] = useMutation(VIEWER_TOGGLE_CHAT_MESSAGE_REACTION);

  // Live updates via socket.io.
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
      s.on('connect', () => {
        s.emit('joinRoom', { roomId });
      });
      s.on('chat:message', (payload: ChatMessageRow) => {
        if (payload.roomId === roomId && !payload.parentMessageId) {
          void refetchMessages();
        }
      });
      s.on('chat:reaction', () => {
        void refetchMessages();
        if (openThreadId) void refetchThread();
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
  }, [roomId, refetchMessages, refetchThread, openThreadId]);

  const rawMessages = msgData?.viewerChatMessages ?? [];
  const sortedMessages = useMemo(
    () => [...rawMessages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [rawMessages],
  );

  // Construit la liste avec séparateurs de date entre messages.
  const items = useMemo<ListItem[]>(() => {
    const out: ListItem[] = [];
    let lastDay = '';
    let lastSenderId = '';
    for (const m of sortedMessages) {
      const day = m.createdAt.slice(0, 10);
      if (day !== lastDay) {
        out.push({
          kind: 'date',
          key: `date-${day}`,
          label: formatThreadSeparatorDate(m.createdAt),
        });
        lastDay = day;
        lastSenderId = '';
      }
      const showAuthor =
        m.sender.id !== lastSenderId && m.sender.id !== viewerMemberId;
      out.push({ kind: 'msg', msg: m, showAuthor });
      lastSenderId = m.sender.id;
    }
    return out;
  }, [sortedMessages, viewerMemberId]);

  // Auto-scroll au dernier message.
  useEffect(() => {
    if (items.length > 0) {
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      });
    }
  }, [items.length]);

  async function onSendRoot() {
    if (!draft.trim()) return;
    try {
      await postMessage({
        variables: { input: { roomId, body: draft.trim() } },
      });
      setDraft('');
      void refetchMessages();
    } catch {
      /* silencieux */
    }
  }

  async function onSendReply() {
    if (!openThreadId || !threadDraft.trim()) return;
    try {
      await postMessage({
        variables: {
          input: { roomId, body: threadDraft.trim(), parentMessageId: openThreadId },
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
      await toggleReaction({ variables: { input: { messageId, emoji } } });
      void refetchMessages();
      if (openThreadId) void refetchThread();
    } catch {
      /* silencieux */
    }
    setReactionPickerForId(null);
  }

  const canPost =
    Boolean(room) &&
    !room?.archivedAt &&
    room?.channelMode !== 'READ_ONLY' &&
    room?.viewerCanPost;
  const canReply =
    Boolean(room) && !room?.archivedAt && room?.channelMode !== 'READ_ONLY' && room?.viewerCanReply;

  const lockBanner = !room
    ? null
    : room.archivedAt
      ? 'Salon archivé — lecture seule.'
      : room.channelMode === 'READ_ONLY'
        ? 'Salon de diffusion — lecture seule.'
        : !room.viewerCanPost && room.viewerCanReply
          ? 'Vous pouvez répondre dans un fil mais pas créer un nouveau message.'
          : null;

  return (
    <View style={[styles.flex, { backgroundColor: WA_BG }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.headerBack}
          accessibilityLabel="Retour"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={22} color={palette.ink} />
        </Pressable>
        <View style={[styles.headerAvatar, { backgroundColor: authorColor(roomId) }]}>
          <Text style={styles.headerAvatarText}>
            {initials(room ? roomLabel(room) : '?')}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {room ? roomLabel(room) : '…'}
            {room?.isBroadcastChannel ? '  📣' : ''}
          </Text>
          {room?.description ? (
            <Text style={styles.headerSub} numberOfLines={1}>
              {room.description}
            </Text>
          ) : room ? (
            <Text style={styles.headerSub} numberOfLines={1}>
              {room.members.length} participant
              {room.members.length > 1 ? 's' : ''}
            </Text>
          ) : null}
        </View>
      </View>

      {lockBanner ? (
        <View style={styles.banner}>
          <Ionicons
            name="information-circle-outline"
            size={16}
            color={palette.warningText}
          />
          <Text style={styles.bannerText}>{lockBanner}</Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 56}
      >
        <FlatList
          ref={flatListRef}
          data={items}
          keyExtractor={(it) =>
            it.kind === 'date' ? it.key : `m-${it.msg.id}`
          }
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            if (item.kind === 'date') {
              return <DatePill label={item.label} />;
            }
            const m = item.msg;
            const mine = m.sender.id === viewerMemberId;
            return (
              <Bubble
                msg={m}
                mine={mine}
                showAuthor={item.showAuthor}
                primary={primary}
                onLongPress={() => setReactionPickerForId(m.id)}
                onPressReaction={(e) => void onToggleReaction(m.id, e)}
                onPressThread={() => {
                  setOpenThreadId(m.id);
                  setThreadDraft('');
                }}
                canReply={Boolean(canReply)}
              />
            );
          }}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
        />

        {/* Composer */}
        {canPost ? (
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={() => void onSendRoot()}
            primary={primary}
          />
        ) : (
          <View style={[styles.composer, { paddingBottom: insets.bottom || spacing.md }]}>
            <Text style={styles.composerLocked}>
              {room?.archivedAt
                ? 'Salon archivé.'
                : room?.channelMode === 'READ_ONLY'
                  ? 'Diffusion seule — vous ne pouvez pas écrire.'
                  : !room?.viewerCanPost
                    ? 'Écriture désactivée pour votre rôle.'
                    : '…'}
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Modal thread */}
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
              accessibilityRole="button"
              accessibilityLabel="Fermer le fil"
            >
              <Ionicons name="close" size={24} color={palette.ink} />
            </Pressable>
          </View>
          <ScrollView
            style={[styles.flex, { backgroundColor: WA_BG }]}
            contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
          >
            {(threadData?.viewerChatThreadReplies ?? []).length === 0 ? (
              <Text style={styles.threadEmpty}>
                Aucune réponse pour l'instant.
              </Text>
            ) : null}
            {(threadData?.viewerChatThreadReplies ?? []).map((r) => {
              const mine = r.sender.id === viewerMemberId;
              return (
                <Bubble
                  key={r.id}
                  msg={r}
                  mine={mine}
                  showAuthor={!mine}
                  primary={primary}
                  onLongPress={() => setReactionPickerForId(r.id)}
                  onPressReaction={(e) => void onToggleReaction(r.id, e)}
                  canReply={false}
                />
              );
            })}
          </ScrollView>
          {canReply ? (
            <Composer
              value={threadDraft}
              onChange={setThreadDraft}
              onSend={() => void onSendReply()}
              primary={primary}
              placeholder="Répondre dans le fil…"
            />
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
          <Pressable style={styles.emojiSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.emojiHandle} />
            <Text style={styles.emojiSheetTitle}>Réagir</Text>
            <View style={styles.emojiGrid}>
              {QUICK_EMOJIS.map((e) => (
                <Pressable
                  key={e}
                  style={styles.emojiBtn}
                  onPress={() => {
                    if (reactionPickerForId)
                      void onToggleReaction(reactionPickerForId, e);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Réagir ${e}`}
                >
                  <Text style={styles.emojiBtnText}>{e}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// --- Pieces ---

function DatePill({ label }: { label: string }) {
  return (
    <View style={styles.datePillWrap}>
      <View style={styles.datePill}>
        <Text style={styles.datePillText}>{label}</Text>
      </View>
    </View>
  );
}

function Bubble({
  msg,
  mine,
  showAuthor,
  primary,
  onLongPress,
  onPressReaction,
  onPressThread,
  canReply,
}: {
  msg: ChatMessageRow;
  mine: boolean;
  showAuthor: boolean;
  primary: string;
  onLongPress: () => void;
  onPressReaction: (emoji: string) => void;
  onPressThread?: () => void;
  canReply: boolean;
}) {
  const senderName = msg.sender.pseudo ?? msg.sender.firstName;
  const senderColor = authorColor(msg.sender.id);
  const bubbleBg = mine ? WA_OUT : '#ffffff';

  return (
    <View
      style={[
        styles.bubbleRow,
        mine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
      ]}
    >
      {/* Avatar pour l'autre uniquement quand le message commence un nouveau bloc */}
      {!mine ? (
        <View style={styles.avatarSlot}>
          {showAuthor ? (
            <View style={[styles.bubbleAvatar, { backgroundColor: senderColor }]}>
              <Text style={styles.bubbleAvatarText}>{initials(senderName)}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <Pressable
        onLongPress={onLongPress}
        style={[
          styles.bubble,
          { backgroundColor: bubbleBg },
          mine ? styles.bubbleMine : styles.bubbleTheirs,
          mine && showAuthor ? null : null, // shape preserved
        ]}
      >
        {/* Auteur en couleur (uniquement pour les autres et au début d'un bloc) */}
        {!mine && showAuthor ? (
          <Text style={[styles.author, { color: senderColor }]}>
            {senderName}
            {msg.postedByAdmin ? '  ' : ''}
            {msg.postedByAdmin ? (
              <Text style={[styles.adminTag, { backgroundColor: primary }]}>
                {' '}admin{' '}
              </Text>
            ) : null}
          </Text>
        ) : null}
        {/* Si admin et c'est mon message, on garde un petit tag aussi */}
        {mine && msg.postedByAdmin ? (
          <Text style={[styles.adminTagInline, { color: primary }]}>
            posté par admin
          </Text>
        ) : null}

        <Text style={styles.bubbleBody}>{msg.body}</Text>
        <Text style={styles.bubbleTime}>{formatBubbleTime(msg.createdAt)}</Text>
      </Pressable>

      {/* Réactions affichées sous la bulle, légèrement débordantes (style WhatsApp) */}
      {msg.reactions.length > 0 ? (
        <View
          style={[
            styles.reactionsRow,
            mine ? styles.reactionsRowMine : styles.reactionsRowTheirs,
          ]}
        >
          {msg.reactions.map((r) => (
            <Pressable
              key={r.emoji}
              onPress={() => onPressReaction(r.emoji)}
              style={[
                styles.reactionPill,
                r.reactedByViewer && {
                  borderColor: primary,
                  backgroundColor: '#ffffff',
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Réaction ${r.emoji}, ${r.count}`}
            >
              <Text style={styles.reactionEmoji}>{r.emoji}</Text>
              {r.count > 1 ? (
                <Text style={styles.reactionCount}>{r.count}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Lien thread style "X réponses" sous la bulle */}
      {!mine && canReply && msg.replyCount > 0 && onPressThread ? (
        <AnimatedPressable
          onPress={onPressThread}
          style={[styles.threadLink, styles.reactionsRowTheirs]}
          accessibilityRole="link"
          accessibilityLabel={`Voir ${msg.replyCount} réponses`}
        >
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={14}
            color={primary}
          />
          <Text style={[styles.threadLinkText, { color: primary }]}>
            {msg.replyCount} réponse{msg.replyCount > 1 ? 's' : ''}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={primary} />
        </AnimatedPressable>
      ) : null}
      {!mine && canReply && msg.replyCount === 0 && onPressThread ? (
        <AnimatedPressable
          onPress={onPressThread}
          style={[styles.threadLinkSubtle, styles.reactionsRowTheirs]}
          accessibilityRole="button"
          accessibilityLabel="Répondre dans un fil"
        >
          <Ionicons
            name="return-down-forward-outline"
            size={13}
            color={palette.muted}
          />
          <Text style={styles.threadLinkSubtleText}>Répondre</Text>
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  primary,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  primary: string;
  placeholder?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.composer,
        { paddingBottom: (insets.bottom || 0) + spacing.sm },
      ]}
    >
      <View style={styles.composerInputWrap}>
        <Pressable
          style={styles.composerIcon}
          accessibilityRole="button"
          accessibilityLabel="Emoji"
        >
          <Ionicons name="happy-outline" size={22} color={palette.muted} />
        </Pressable>
        <TextInput
          style={styles.composerInput}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder ?? 'Message…'}
          placeholderTextColor={palette.muted}
          multiline
        />
        <Pressable
          style={styles.composerIcon}
          accessibilityRole="button"
          accessibilityLabel="Joindre"
        >
          <Ionicons name="attach-outline" size={22} color={palette.muted} />
        </Pressable>
      </View>
      <AnimatedPressable
        onPress={onSend}
        haptic
        accessibilityRole="button"
        accessibilityLabel="Envoyer"
        style={[
          styles.sendBtn,
          { opacity: value.trim() ? 1 : 0.6 },
        ]}
        disabled={!value.trim()}
      >
        <LinearGradient
          colors={[primary, '#7c3aed']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.sendBtnInner}
        >
          <Ionicons
            name={value.trim() ? 'send' : 'mic-outline'}
            size={18}
            color="#ffffff"
          />
        </LinearGradient>
      </AnimatedPressable>
    </View>
  );
}

// --- Constants ---

const WA_BG = '#ece5dd'; // tons crème WhatsApp light
const WA_OUT = '#dcf8c6'; // bulle "moi"

const styles = StyleSheet.create({
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: palette.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  headerBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: typography.bodyStrong.fontFamily,
  },
  headerTitle: { ...typography.h3, color: palette.ink },
  headerSub: { ...typography.caption, color: palette.muted },

  // Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: palette.warningBg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  bannerText: { ...typography.small, color: palette.warningText, flex: 1 },

  // List
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: 2,
  },

  // Date pill
  datePillWrap: {
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  datePill: {
    backgroundColor: 'rgba(225, 245, 254, 0.95)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    ...shadow.sm,
  },
  datePillText: { ...typography.caption, color: palette.body },

  // Bubble
  bubbleRow: { gap: 2, marginVertical: 1 },
  bubbleRowMine: { alignItems: 'flex-end' },
  bubbleRowTheirs: { alignItems: 'flex-start', flexDirection: 'row' },

  avatarSlot: { width: 32, marginRight: spacing.xs, alignSelf: 'flex-end' },
  bubbleAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  bubbleAvatarText: {
    color: '#ffffff',
    fontSize: 11,
    fontFamily: typography.bodyStrong.fontFamily,
  },

  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 18, // place pour l'heure en bas-droite
    ...shadow.sm,
  },
  bubbleTheirs: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
  },
  bubbleMine: {
    borderTopRightRadius: 0,
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  author: {
    fontSize: 13,
    fontFamily: typography.bodyStrong.fontFamily,
    marginBottom: 2,
  },
  adminTag: {
    fontSize: 10,
    color: '#ffffff',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
    fontFamily: typography.smallStrong.fontFamily,
  },
  adminTagInline: {
    fontSize: 11,
    fontFamily: typography.smallStrong.fontFamily,
    marginBottom: 2,
  },
  bubbleBody: {
    fontSize: 15,
    lineHeight: 21,
    color: palette.ink,
    fontFamily: typography.body.fontFamily,
  },
  bubbleTime: {
    position: 'absolute',
    bottom: 4,
    right: 8,
    fontSize: 10,
    color: palette.muted,
    fontFamily: typography.caption.fontFamily,
  },

  // Reactions overlay sous la bulle
  reactionsRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: -10,
    paddingHorizontal: spacing.xs,
    flexWrap: 'wrap',
  },
  reactionsRowMine: { alignSelf: 'flex-end', marginRight: 0 },
  reactionsRowTheirs: { alignSelf: 'flex-start', marginLeft: 32 + spacing.xs },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    ...shadow.sm,
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { ...typography.caption, color: palette.body, fontSize: 11 },

  // Thread link
  threadLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  threadLinkText: {
    ...typography.smallStrong,
    fontSize: 12,
  },
  threadLinkSubtle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  threadLinkSubtleText: { ...typography.caption, color: palette.muted },

  // Composer
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    backgroundColor: WA_BG,
  },
  composerInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    minHeight: 44,
    ...shadow.sm,
  },
  composerIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerInput: {
    flex: 1,
    fontSize: 15,
    color: palette.ink,
    fontFamily: typography.body.fontFamily,
    paddingHorizontal: spacing.xs,
    maxHeight: 100,
    paddingVertical: 6,
  },
  composerLocked: {
    flex: 1,
    textAlign: 'center',
    color: palette.muted,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: WA_BG,
    ...typography.small,
  },

  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    ...shadow.glowPrimary,
  },
  sendBtnInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Modal thread
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
    backgroundColor: palette.surface,
  },
  modalTitle: { ...typography.h2, color: palette.ink },
  threadEmpty: {
    ...typography.body,
    color: palette.muted,
    textAlign: 'center',
    padding: spacing.xl,
  },

  // Emoji picker
  emojiBackdrop: {
    flex: 1,
    backgroundColor: palette.overlay,
    justifyContent: 'flex-end',
  },
  emojiSheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  emojiHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.border,
  },
  emojiSheetTitle: { ...typography.smallStrong, color: palette.body },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-around',
  },
  emojiBtn: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: palette.bgAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiBtnText: { fontSize: 28 },
});
