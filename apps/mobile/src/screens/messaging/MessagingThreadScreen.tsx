import { useMutation, useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { io, type Socket } from 'socket.io-client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { AnimatedPressable } from '../../components/ui';
import {
  VIEWER_CHAT_MESSAGES,
  VIEWER_CHAT_ROOMS,
  VIEWER_CHAT_THREAD_REPLIES,
  VIEWER_DELETE_CHAT_MESSAGE,
  VIEWER_EDIT_CHAT_MESSAGE,
  VIEWER_POST_CHAT_MESSAGE,
  VIEWER_TOGGLE_CHAT_MESSAGE_REACTION,
} from '../../lib/messaging-documents';
import { MessageActionsSheet, type ActionKey } from './MessageActionsSheet';
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
  /** ID du message ciblé par le menu long-press (null = sheet fermé). */
  const [actionTargetId, setActionTargetId] = useState<string | null>(null);
  /** ID du message ciblé par le picker emoji "+" (null = picker fermé). */
  const [reactionPickerForId, setReactionPickerForId] = useState<
    string | null
  >(null);
  /** ID du message en cours d'édition. Si non-null, le composer affiche
   *  une bannière "Modification de…" + le contenu pré-rempli. */
  const [editingMessageId, setEditingMessageId] = useState<string | null>(
    null,
  );
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
  const [editMessage] = useMutation(VIEWER_EDIT_CHAT_MESSAGE);
  const [deleteMessage] = useMutation(VIEWER_DELETE_CHAT_MESSAGE);

  // Le viewer est-il modérateur (ADMIN) du salon ?
  const viewerIsRoomAdmin = useMemo(
    () =>
      Boolean(
        room?.members.some(
          (m) => m.memberId === viewerMemberId && m.role === 'ADMIN',
        ),
      ),
    [room, viewerMemberId],
  );

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

  // Récupère le message ciblé par le sheet (utilisé pour les actions).
  const targetMessage = useMemo(
    () => sortedMessages.find((m) => m.id === actionTargetId) ?? null,
    [sortedMessages, actionTargetId],
  );
  const targetIsMine = targetMessage?.sender.id === viewerMemberId;

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
      // Mode édition : on appelle viewerEditChatMessage au lieu de
      // postMessage et on ferme le mode édition après succès.
      if (editingMessageId) {
        await editMessage({
          variables: {
            input: { messageId: editingMessageId, body: draft.trim() },
          },
        });
        setEditingMessageId(null);
        setDraft('');
        void refetchMessages();
        return;
      }
      await postMessage({
        variables: { input: { roomId, body: draft.trim() } },
      });
      setDraft('');
      void refetchMessages();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Échec de l\'envoi.';
      Alert.alert('Erreur', msg);
    }
  }

  async function onActionSheetAction(action: ActionKey) {
    const target = targetMessage;
    if (!target) {
      setActionTargetId(null);
      return;
    }
    switch (action) {
      case 'reply': {
        setOpenThreadId(target.id);
        setThreadDraft('');
        break;
      }
      case 'copy': {
        await Clipboard.setStringAsync(target.body);
        break;
      }
      case 'forward': {
        try {
          await Share.share({ message: target.body });
        } catch {
          /* user cancelled */
        }
        break;
      }
      case 'edit': {
        setEditingMessageId(target.id);
        setDraft(target.body);
        break;
      }
      case 'delete': {
        Alert.alert(
          'Supprimer ce message ?',
          'Cette action est irréversible.',
          [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Supprimer',
              style: 'destructive',
              onPress: async () => {
                try {
                  await deleteMessage({
                    variables: { messageId: target.id },
                  });
                  void refetchMessages();
                } catch (err: unknown) {
                  const msg =
                    err instanceof Error
                      ? err.message
                      : 'Suppression impossible.';
                  Alert.alert('Erreur', msg);
                }
              },
            },
          ],
        );
        break;
      }
      case 'morereact': {
        // On ouvre le picker complet pour ce message.
        setReactionPickerForId(target.id);
        break;
      }
    }
    setActionTargetId(null);
  }

  function onCancelEdit() {
    setEditingMessageId(null);
    setDraft('');
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
      <View
        style={[
          styles.header,
          { paddingTop: Math.max(insets.top, spacing.md) + spacing.sm },
        ]}
      >
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
                onLongPress={() => setActionTargetId(m.id)}
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

        {/* Bandeau "Modification du message" */}
        {editingMessageId && canPost ? (
          <View style={styles.editBanner}>
            <Ionicons name="create-outline" size={16} color={primary} />
            <Text style={[styles.editBannerText, { color: primary }]}>
              Modification du message
            </Text>
            <Pressable
              onPress={onCancelEdit}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Annuler la modification"
            >
              <Ionicons name="close" size={18} color={palette.muted} />
            </Pressable>
          </View>
        ) : null}

        {/* Composer */}
        {canPost ? (
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={() => void onSendRoot()}
            primary={primary}
            placeholder={editingMessageId ? 'Modifier…' : 'Message…'}
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

      {/* Action sheet long-press */}
      <MessageActionsSheet
        visible={actionTargetId !== null}
        isMine={Boolean(targetIsMine)}
        canModerate={viewerIsRoomAdmin}
        canReply={Boolean(canReply)}
        onClose={() => setActionTargetId(null)}
        onPickEmoji={(e) => {
          if (actionTargetId) {
            void onToggleReaction(actionTargetId, e);
          }
          setActionTargetId(null);
        }}
        onAction={(a) => void onActionSheetAction(a)}
      />

      {/* Modal picker emoji complet (déclenché depuis "+" du sheet) */}
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
        styles.bubbleColumn,
        showAuthor || mine ? styles.bubbleRowLoose : styles.bubbleRowTight,
      ]}
    >
      {/* Row interne : avatar (autres uniquement) + bulle */}
      <View
        style={[
          styles.bubbleInnerRow,
          mine ? styles.bubbleInnerRowMine : styles.bubbleInnerRowTheirs,
        ]}
      >
        {!mine ? (
          <View style={styles.avatarSlot}>
            {showAuthor ? (
              <View
                style={[styles.bubbleAvatar, { backgroundColor: senderColor }]}
              >
                <Text style={styles.bubbleAvatarText}>
                  {initials(senderName)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Pressable
          onLongPress={onLongPress}
          delayLongPress={300}
          style={[
            styles.bubble,
            { backgroundColor: bubbleBg },
            mine ? styles.bubbleMine : styles.bubbleTheirs,
          ]}
          accessibilityLabel="Maintenir pour ouvrir les actions"
        >
          {/* Auteur en couleur (uniquement pour les autres et au début d'un bloc) */}
          {!mine && showAuthor ? (
            <View style={styles.authorRow}>
              <Text style={[styles.author, { color: senderColor }]}>
                {senderName}
              </Text>
              {msg.postedByAdmin ? (
                <View
                  style={[styles.adminTag, { backgroundColor: primary }]}
                >
                  <Text style={styles.adminTagText}>admin</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          {mine && msg.postedByAdmin ? (
            <Text style={[styles.adminTagInline, { color: primary }]}>
              posté par admin
            </Text>
          ) : null}

          <Text style={styles.bubbleBody}>{msg.body}</Text>
          <View style={styles.bubbleFooter}>
            {msg.editedAt ? (
              <Text style={styles.bubbleEdited}>modifié</Text>
            ) : null}
            <Text style={styles.bubbleTime}>
              {formatBubbleTime(msg.createdAt)}
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Réactions sous la bulle, débordantes vers la bulle */}
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

      {/* "X réponses" cliquable sous la bulle */}
      {!mine && canReply && msg.replyCount > 0 && onPressThread ? (
        <AnimatedPressable
          onPress={onPressThread}
          style={[styles.threadLink, styles.threadLinkAlignTheirs]}
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
        { paddingBottom: Math.max(insets.bottom, spacing.sm) + spacing.xs },
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
    gap: 4,
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

  // Bubble — outer container (column) : bulle + réactions + thread link.
  bubbleColumn: {},
  /** Espacement vertical entre 2 messages d'un même auteur (consécutifs). */
  bubbleRowTight: { marginTop: 2 },
  /** Espacement vertical en début d'un nouveau cluster (auteur change). */
  bubbleRowLoose: { marginTop: spacing.sm },
  // Inner row : avatar (autres uniquement) + bulle.
  bubbleInnerRow: { flexDirection: 'row', alignItems: 'flex-end' },
  bubbleInnerRowMine: { justifyContent: 'flex-end' },
  bubbleInnerRowTheirs: { justifyContent: 'flex-start' },

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
    paddingVertical: 6,
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
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  author: {
    fontSize: 13,
    fontFamily: typography.bodyStrong.fontFamily,
  },
  adminTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  adminTagText: {
    color: '#ffffff',
    fontSize: 10,
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
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 2,
  },
  bubbleEdited: {
    fontSize: 10,
    color: palette.muted,
    fontFamily: typography.caption.fontFamily,
    fontStyle: 'italic',
  },
  bubbleTime: {
    fontSize: 10,
    color: palette.muted,
    fontFamily: typography.caption.fontFamily,
  },

  // Reactions placées juste sous la bulle, légèrement débordantes vers
  // le haut pour mordre la bulle (style WhatsApp).
  reactionsRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: -10,
    flexWrap: 'wrap',
  },
  reactionsRowMine: { alignSelf: 'flex-end', marginRight: spacing.md },
  reactionsRowTheirs: {
    alignSelf: 'flex-start',
    marginLeft: 32 + spacing.xs + spacing.md, // après l'avatar (32) + gap interne
  },
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

  // Thread link "X réponses" en pill flottante sous la bulle.
  threadLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignSelf: 'flex-start',
  },
  threadLinkAlignTheirs: {
    marginLeft: 32 + spacing.xs + spacing.md,
  },
  threadLinkText: {
    ...typography.smallStrong,
    fontSize: 12,
  },

  // Banner "Modification du message"
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  editBannerText: { ...typography.smallStrong, flex: 1 },

  // Composer
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
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
