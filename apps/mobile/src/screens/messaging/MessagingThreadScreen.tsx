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
  Image,
  KeyboardAvoidingView,
  Linking,
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
import { absolutizeMediaUrl } from '../../lib/absolutize-url';
import type { UploadedMediaAsset, MediaUploadKind } from '../../lib/media-upload';
import { AttachmentPickerSheet } from './AttachmentPickerSheet';
import { VoicePlayer, VoiceRecorder } from './VoiceComponents';
import {
  QUICK_EMOJIS,
  roomLabel,
  type ChatAttachmentKind,
  type ChatMessageAttachment,
  type ChatMessageRow,
  type ChatRoomRow,
  type MessagingStackParamList,
} from './types';

/**
 * État local d'une pièce jointe en attente d'envoi (après upload mais
 * avant la mutation `viewerPostChatMessage`). Affichée comme chip dans
 * le composer pour permettre la suppression avant envoi.
 */
type PendingAttachment = {
  asset: UploadedMediaAsset;
  kind: MediaUploadKind;
  durationMs?: number;
};

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
  // Pièces jointes uploadées et en attente d'envoi (chips dans le
  // composer). Vidé après chaque `viewerPostChatMessage` réussi.
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [attachmentSheetOpen, setAttachmentSheetOpen] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
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
    const trimmed = draft.trim();
    const hasAttachments = pendingAttachments.length > 0;
    // Un message doit avoir AU MOINS un texte ou des pièces jointes.
    if (!trimmed && !hasAttachments) return;
    try {
      // Mode édition : on appelle viewerEditChatMessage au lieu de
      // postMessage et on ferme le mode édition après succès.
      // NB : l'édition ne touche PAS aux attachments en v1 — pour
      // changer les attachments l'utilisateur doit supprimer + repost.
      if (editingMessageId) {
        await editMessage({
          variables: {
            input: { messageId: editingMessageId, body: trimmed },
          },
        });
        setEditingMessageId(null);
        setDraft('');
        void refetchMessages();
        return;
      }
      await postMessage({
        variables: {
          input: {
            roomId,
            body: trimmed || null,
            attachmentMediaAssetIds:
              pendingAttachments.length > 0
                ? pendingAttachments.map((p) => p.asset.id)
                : null,
          },
        },
      });
      setDraft('');
      setPendingAttachments([]);
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
        // body peut être null pour les messages 100% pièces jointes —
        // on copie juste vide dans ce cas (l'action est exposée mais
        // sans effet utile, le user verra l'alert clipboard).
        await Clipboard.setStringAsync(target.body ?? '');
        break;
      }
      case 'forward': {
        try {
          await Share.share({ message: target.body ?? '' });
        } catch {
          /* user cancelled */
        }
        break;
      }
      case 'edit': {
        setEditingMessageId(target.id);
        setDraft(target.body ?? '');
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

      {/*
        KeyboardAvoidingView : behavior conditionnel par plateforme.
         - **iOS** : `behavior="padding"` + `keyboardVerticalOffset` =
           hauteur du header custom (insets.top + 56). Sans ça l'input
           passe sous le clavier.
         - **Android** : `behavior={undefined}` → on laisse
           `softwareKeyboardLayoutMode: "resize"` (app.json) gérer le
           redimensionnement nativement. Si on laisse "padding" sur
           Android, on a une DOUBLE compensation (resize + padding) qui
           pousse le composer 2× trop haut au-dessus du clavier — bug
           remonté par l'utilisateur.
         - FlatList prend `style={styles.flex}` explicitement (sinon il
           ne s'étire pas et le composer flotte).
      */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={
          Platform.OS === 'ios' ? insets.top + 56 : 0
        }
      >
        <FlatList
          ref={flatListRef}
          style={styles.flex}
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
            pendingAttachments={pendingAttachments}
            onRemoveAttachment={(id) =>
              setPendingAttachments((prev) =>
                prev.filter((p) => p.asset.id !== id),
              )
            }
            onOpenAttachmentSheet={() => setAttachmentSheetOpen(true)}
            onVoiceRecorded={(asset, durationMs) => {
              // Auto-send : un vocal est posté immédiatement (pattern
              // WhatsApp). On bypass le pending state et envoie via
              // postMessage avec un attachmentMediaAssetIds dédié.
              void postMessage({
                variables: {
                  input: {
                    roomId,
                    body: null,
                    attachmentMediaAssetIds: [asset.id],
                  },
                },
              })
                .then(() => void refetchMessages())
                .catch((err: unknown) => {
                  Alert.alert(
                    'Erreur',
                    err instanceof Error ? err.message : 'Échec envoi vocal',
                  );
                });
            }}
            onVoiceRecordingChange={setVoiceRecording}
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
        {/*
          Modal "Fil de réponses" : KAV en padding sur 2 plateformes,
          offset 0 car la modal occupe tout l'écran (pas de header
          parent à compenser).
        */}
        <KeyboardAvoidingView
          style={styles.flex}
          behavior="padding"
          keyboardVerticalOffset={0}
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
              // Pas de pièces jointes en réponse en fil pour l'instant
              // (UX simplification — restreint aux messages racine).
              pendingAttachments={[]}
              onRemoveAttachment={() => undefined}
              onOpenAttachmentSheet={() => undefined}
              onVoiceRecorded={() => undefined}
              onVoiceRecordingChange={() => undefined}
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

      {/* Sheet "Ajouter une pièce jointe" — caméra/galerie/vidéo/PDF.
          Le rendu de l'asset uploadé est géré dans `pendingAttachments`
          puis envoyé via `viewerPostChatMessage` au prochain Send. */}
      <AttachmentPickerSheet
        visible={attachmentSheetOpen}
        onClose={() => setAttachmentSheetOpen(false)}
        onUploaded={(asset, kind) => {
          setPendingAttachments((prev) => [
            ...prev,
            { asset, kind },
          ]);
        }}
      />
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

          {/* Pièces jointes — affichées AVANT le body texte. Chaque
              attachment a son viewer dédié (image inline, lecteur audio,
              thumbnail vidéo + tap pour player, lien PDF). */}
          {msg.attachments && msg.attachments.length > 0 ? (
            <View style={styles.attachmentsCol}>
              {msg.attachments.map((a) => (
                <AttachmentView
                  key={a.id}
                  attachment={a}
                  primary={primary}
                  mine={mine}
                />
              ))}
            </View>
          ) : null}

          {msg.body ? (
            <Text style={styles.bubbleBody}>{msg.body}</Text>
          ) : null}
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
  pendingAttachments,
  onRemoveAttachment,
  onOpenAttachmentSheet,
  onVoiceRecorded,
  onVoiceRecordingChange,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  primary: string;
  placeholder?: string;
  pendingAttachments: PendingAttachment[];
  onRemoveAttachment: (assetId: string) => void;
  onOpenAttachmentSheet: () => void;
  onVoiceRecorded: (asset: UploadedMediaAsset, durationMs: number) => void;
  onVoiceRecordingChange: (recording: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const hasContent = value.trim().length > 0 || pendingAttachments.length > 0;

  return (
    <View
      style={[
        styles.composer,
        { paddingBottom: Math.max(insets.bottom, spacing.sm) + spacing.xs },
      ]}
    >
      {/*
        Row de previews des pièces jointes en attente — AU-DESSUS de la
        zone input. Chaque preview = miniature 64×64 avec :
          - thumbnail réel pour les images
          - icône typée (vidéo/PDF/audio) sur fond coloré pour les autres
          - bouton X en overlay top-right pour retirer
        Scroll horizontal si plus d'une PJ.
      */}
      {pendingAttachments.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.attachPreviewsRow}
          style={styles.attachPreviewsScroll}
        >
          {pendingAttachments.map((a) => (
            <AttachmentPreview
              key={a.asset.id}
              pending={a}
              onRemove={() => onRemoveAttachment(a.asset.id)}
            />
          ))}
        </ScrollView>
      ) : null}

      {/*
        Row composer : [+ attach] [input multiligne] [send/mic].
        Layout horizontal, alignItems flex-end pour que les boutons
        restent en bas même quand l'input grandit (multiline).
      */}
      <View style={styles.composerRow}>
        <Pressable
          style={styles.composerIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Joindre une pièce"
          onPress={onOpenAttachmentSheet}
        >
          <Ionicons name="add-circle-outline" size={28} color={primary} />
        </Pressable>
        <View style={styles.composerInputWrap}>
          <TextInput
            style={styles.composerInput}
            value={value}
            onChangeText={onChange}
            placeholder={placeholder ?? 'Message…'}
            placeholderTextColor={palette.muted}
            multiline
          />
        </View>
        {/*
          Bouton droite :
          - micro tant que pas de texte ET pas d'attachments
          - bouton send dès qu'on a du texte ou des attachments
        */}
        {hasContent ? (
          <AnimatedPressable
            onPress={onSend}
            haptic
            accessibilityRole="button"
            accessibilityLabel="Envoyer"
            style={styles.sendBtn}
          >
            <LinearGradient
              colors={[primary, '#7c3aed']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sendBtnInner}
            >
              <Ionicons name="send" size={18} color="#ffffff" />
            </LinearGradient>
          </AnimatedPressable>
        ) : (
          <VoiceRecorder
            color={primary}
            onRecorded={onVoiceRecorded}
            onRecordingStateChange={onVoiceRecordingChange}
          />
        )}
      </View>
    </View>
  );
}

/**
 * Miniature d'une pièce jointe en attente d'envoi dans le composer.
 * - **IMAGE** → vraie thumbnail (préview de l'image uploadée)
 * - **VIDEO / AUDIO / DOCUMENT** → icône typée sur fond coloré +
 *   label court en dessous (Vidéo / Vocal / PDF)
 * Bouton X en overlay top-right pour retirer la PJ avant envoi.
 */
function AttachmentPreview({
  pending,
  onRemove,
}: {
  pending: PendingAttachment;
  onRemove: () => void;
}) {
  const url = absolutizeMediaUrl(pending.asset.publicUrl) ?? pending.asset.publicUrl;
  const isImage = pending.kind === 'image';
  const label =
    pending.kind === 'audio'
      ? 'Vocal'
      : pending.kind === 'video'
        ? 'Vidéo'
        : pending.kind === 'document'
          ? 'PDF'
          : '';

  return (
    <View style={styles.attachPreview}>
      {isImage ? (
        <Image
          source={{ uri: url }}
          style={styles.attachPreviewImg}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.attachPreviewIcon}>
          <Ionicons
            name={iconForKind(pending.kind)}
            size={28}
            color={palette.primary}
          />
          <Text style={styles.attachPreviewKindLabel}>{label}</Text>
        </View>
      )}
      <Pressable
        onPress={onRemove}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Retirer cette pièce jointe"
        style={({ pressed }) => [
          styles.attachPreviewRemove,
          pressed && { opacity: 0.7 },
        ]}
      >
        <Ionicons name="close" size={14} color="#ffffff" />
      </Pressable>
    </View>
  );
}

function iconForKind(kind: MediaUploadKind): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case 'image':
      return 'image-outline';
    case 'video':
      return 'film-outline';
    case 'audio':
      return 'mic-outline';
    case 'document':
      return 'document-attach-outline';
  }
}

/**
 * Rendu d'une pièce jointe selon son `kind`. Image inline,
 * lecteur audio, thumbnail vidéo (avec play overlay), lien PDF.
 * Affichée dans la bulle de message, au-dessus du body texte.
 */
function AttachmentView({
  attachment,
  primary,
  mine,
}: {
  attachment: ChatMessageAttachment;
  primary: string;
  mine: boolean;
}) {
  const url = absolutizeMediaUrl(attachment.mediaUrl) ?? attachment.mediaUrl;
  const thumbUrl = attachment.thumbnailUrl
    ? absolutizeMediaUrl(attachment.thumbnailUrl) ?? attachment.thumbnailUrl
    : null;

  switch (attachment.kind as ChatAttachmentKind) {
    case 'IMAGE':
      return (
        <Pressable
          onPress={() => {
            // Tap → ouvre l'image en plein écran via le navigateur
            // pour profiter du pinch-zoom natif. Une vraie lightbox
            // serait l'étape v2.
            void Linking.openURL(url).catch(() => undefined);
          }}
          accessibilityRole="image"
          accessibilityLabel="Image"
        >
          <Image
            source={{ uri: url }}
            style={styles.attachmentImage}
            resizeMode="cover"
          />
        </Pressable>
      );

    case 'AUDIO':
      return (
        <View style={styles.attachmentAudio}>
          <VoicePlayer
            url={url}
            durationMs={attachment.durationMs}
            color={mine ? '#075e54' : primary}
          />
        </View>
      );

    case 'VIDEO':
      return (
        <Pressable
          onPress={() => {
            void Linking.openURL(url).catch(() => undefined);
          }}
          accessibilityRole="button"
          accessibilityLabel="Lire la vidéo"
          style={styles.attachmentVideo}
        >
          {thumbUrl ? (
            <Image
              source={{ uri: thumbUrl }}
              style={styles.attachmentImage}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[styles.attachmentImage, styles.attachmentVideoPlaceholder]}
            >
              <Ionicons name="film" size={36} color={palette.muted} />
            </View>
          )}
          <View style={styles.attachmentVideoOverlay}>
            <Ionicons name="play-circle" size={48} color="#ffffff" />
          </View>
        </Pressable>
      );

    case 'DOCUMENT':
      return (
        <Pressable
          onPress={() => {
            void Linking.openURL(url).catch(() => undefined);
          }}
          accessibilityRole="link"
          accessibilityLabel={`Ouvrir ${attachment.fileName}`}
          style={({ pressed }) => [
            styles.attachmentDoc,
            pressed && { opacity: 0.85 },
          ]}
        >
          <View style={styles.attachmentDocIcon}>
            <Ionicons
              name="document-text-outline"
              size={24}
              color={palette.primary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.attachmentDocName} numberOfLines={1}>
              {attachment.fileName}
            </Text>
            <Text style={styles.attachmentDocSize}>
              {formatBytes(attachment.sizeBytes)} · PDF
            </Text>
          </View>
          <Ionicons name="open-outline" size={18} color={palette.muted} />
        </Pressable>
      );
  }
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} ko`;
  return `${(b / (1024 * 1024)).toFixed(1)} Mo`;
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

  // List — `flexGrow: 1` + `justifyContent: 'flex-end'` empile les
  // messages au BAS de la zone visible quand ils sont peu nombreux
  // (pattern WhatsApp). Sans ces deux propriétés, les messages
  // s'affichent en haut et un grand espace blanc reste sous le dernier
  // message — pas naturel pour du chat.
  listContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
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

  // ─── Attachments dans la bulle ───────────────────────────────
  attachmentsCol: {
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  attachmentImage: {
    width: 220,
    height: 220,
    borderRadius: radius.md,
    backgroundColor: palette.bg,
  },
  attachmentVideo: {
    position: 'relative',
  },
  attachmentVideoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentVideoOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: radius.md,
  },
  attachmentAudio: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: radius.md,
    minWidth: 220,
  },
  attachmentDoc: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(0,0,0,0.04)',
    minWidth: 220,
  },
  attachmentDocIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentDocName: {
    ...typography.smallStrong,
    color: palette.ink,
  },
  attachmentDocSize: {
    ...typography.caption,
    color: palette.muted,
    marginTop: 2,
  },

  // Pending attachments — previews 64×64 avec thumbnail réel pour les
  // images, icône typée pour les autres formats. Affichées AU-DESSUS du
  // composer dans une row scrollable horizontalement.
  attachPreviewsScroll: {
    flexGrow: 0, // sinon le ScrollView prend toute la hauteur dispo
  },
  attachPreviewsRow: {
    gap: spacing.sm,
    paddingRight: spacing.md,
    paddingTop: spacing.xs,
  },
  attachPreview: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'visible', // pour que le bouton X dépasse
    position: 'relative',
  },
  attachPreviewImg: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
  },
  attachPreviewIcon: {
    width: '100%',
    height: '100%',
    backgroundColor: palette.primaryLight,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  attachPreviewKindLabel: {
    ...typography.caption,
    color: palette.primary,
    fontWeight: '700',
    fontSize: 10,
  },
  attachPreviewRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
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

  // Composer — wrapper VERTICAL : [previews PJ] + [row input + boutons]
  composer: {
    flexDirection: 'column',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: WA_BG,
    gap: spacing.sm,
  },
  // Row interne du composer (input + boutons)
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  composerIconBtn: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerInputWrap: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    minHeight: 44,
    justifyContent: 'center',
    ...shadow.sm,
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
