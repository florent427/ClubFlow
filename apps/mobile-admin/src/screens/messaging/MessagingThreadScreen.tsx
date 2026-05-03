import { useMutation, useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AnimatedPressable,
  BottomActionBar,
  EmptyState,
  Skeleton,
  formatBubbleTime,
  memberDisplayName,
  palette,
  radius,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ADMIN_POST_CHAT_MESSAGE,
  CLUB_CHAT_ROOM_MESSAGES_ADMIN,
  VIEWER_GET_OR_CREATE_DIRECT_CHAT,
} from '../../lib/documents/messaging';

type Sender = {
  id: string;
  pseudo?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

type ChatMessage = {
  id: string;
  roomId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  parentMessageId: string | null;
  replyCount: number;
  lastReplyAt: string | null;
  postedByAdmin: boolean;
  sender: Sender | null;
  reactions: { emoji: string; count: number; reactedByViewer: boolean }[];
};

type Data = { clubChatRoomMessagesAdmin: ChatMessage[] };

type RouteParams = { MessagingThread: { roomId: string } };

export function MessagingThreadScreen() {
  const route = useRoute<RouteProp<RouteParams, 'MessagingThread'>>();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { roomId } = route.params;

  const [draft, setDraft] = useState('');
  const [dmTarget, setDmTarget] = useState<Sender | null>(null);
  const [openingDm, setOpeningDm] = useState(false);

  const { data, loading, refetch } = useQuery<Data>(
    CLUB_CHAT_ROOM_MESSAGES_ADMIN,
    {
      variables: { roomId },
      errorPolicy: 'all',
    },
  );

  const [postMessage, { loading: posting }] = useMutation(
    ADMIN_POST_CHAT_MESSAGE,
  );
  const [getOrCreateDirect] = useMutation(VIEWER_GET_OR_CREATE_DIRECT_CHAT);

  const onOpenDmWith = async (peerMemberId: string) => {
    setOpeningDm(true);
    try {
      const res = await getOrCreateDirect({
        variables: { peerMemberId },
      });
      const newRoomId = (
        res.data as
          | { viewerGetOrCreateDirectChat?: { id: string } }
          | null
          | undefined
      )?.viewerGetOrCreateDirectChat?.id;
      if (!newRoomId) throw new Error('Conversation introuvable.');
      // Si on est déjà dans cette DM, on ne fait rien.
      if (newRoomId === roomId) {
        Alert.alert('Information', 'Vous êtes déjà dans cette conversation.');
        return;
      }
      (
        nav as unknown as {
          navigate: (n: string, p: object) => void;
        }
      ).navigate('MessagingThread', { roomId: newRoomId });
    } catch (e: unknown) {
      Alert.alert(
        'Erreur',
        e instanceof Error
          ? e.message
          : 'Impossible d\'ouvrir le message privé.',
      );
    } finally {
      setOpeningDm(false);
    }
  };

  const messages = data?.clubChatRoomMessagesAdmin ?? [];

  const handleSend = async () => {
    const body = draft.trim();
    if (body.length === 0) return;
    try {
      await postMessage({
        variables: { input: { roomId, body } },
      });
      setDraft('');
      await refetch();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Envoi impossible');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + spacing.sm },
        ]}
      >
        <AnimatedPressable
          onPress={() => nav.goBack()}
          accessibilityLabel="Retour"
          style={styles.iconBtn}
        >
          <Ionicons name="arrow-back" size={22} color={palette.surface} />
        </AnimatedPressable>
        <View style={styles.headerCenter}>
          <Text style={styles.eyebrow}>CONVERSATION</Text>
          <Text style={styles.headerTitle}>Salon</Text>
        </View>
        <AnimatedPressable
          onPress={() =>
            (nav as any).navigate('ChatGroupSettings', { roomId })
          }
          accessibilityLabel="Paramètres"
          style={styles.iconBtn}
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={22}
            color={palette.surface}
          />
        </AnimatedPressable>
      </View>

      <View style={styles.body}>
        {loading && messages.length === 0 ? (
          <View style={styles.loaderWrap}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[styles.bubble, styles.bubbleLeft]}>
                <Skeleton height={14} width={'70%' as `${number}%`} />
                <Skeleton height={12} width={'40%' as `${number}%`} />
              </View>
            ))}
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.empty}>
            <EmptyState
              icon="chatbox-outline"
              title="Aucun message"
              description="Soyez le premier à écrire dans ce salon."
            />
          </View>
        ) : (
          <FlatList
            data={messages}
            inverted
            keyExtractor={(m) => m.id}
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              gap: spacing.sm,
            }}
            renderItem={({ item }) => (
              <Bubble
                message={item}
                onPressSender={(sender) => setDmTarget(sender)}
              />
            )}
            refreshing={loading}
            onRefresh={() => void refetch()}
          />
        )}
      </View>

      <View
        style={[
          styles.composer,
          { paddingBottom: Math.max(insets.bottom, spacing.sm) },
        ]}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Écrire un message…"
          placeholderTextColor={palette.mutedSoft}
          multiline
          style={styles.input}
        />
        <AnimatedPressable
          onPress={handleSend}
          disabled={posting || draft.trim().length === 0}
          accessibilityLabel="Envoyer"
          haptic
          style={[
            styles.sendBtn,
            (posting || draft.trim().length === 0) && { opacity: 0.4 },
          ]}
        >
          <Ionicons name="send" size={20} color={palette.surface} />
        </AnimatedPressable>
      </View>

      <BottomActionBar
        visible={dmTarget !== null}
        onClose={() => setDmTarget(null)}
        title={dmTarget ? memberDisplayName(dmTarget) : ''}
        actions={[
          {
            key: 'dm',
            label: openingDm
              ? 'Ouverture…'
              : 'Envoyer un message privé',
            icon: 'chatbubble-ellipses-outline',
            tone: 'primary',
            disabled: openingDm,
          },
          {
            key: 'profile',
            label: 'Voir le profil adhérent',
            icon: 'person-outline',
          },
        ]}
        onAction={(key) => {
          const target = dmTarget;
          setDmTarget(null);
          if (!target) return;
          if (key === 'dm') void onOpenDmWith(target.id);
          else if (key === 'profile') {
            // Navigation vers la fiche membre depuis la stack racine.
            (
              nav as unknown as {
                navigate: (n: string, p?: object) => void;
              }
            ).navigate('Community', {
              screen: 'MemberDetail',
              params: { memberId: target.id },
            });
          }
        }}
      />
    </KeyboardAvoidingView>
  );
}

function Bubble({
  message,
  onPressSender,
}: {
  message: ChatMessage;
  onPressSender: (sender: Sender) => void;
}) {
  const isAdmin = message.postedByAdmin;
  const senderName = message.sender
    ? memberDisplayName(message.sender)
    : 'Système';
  const canTapSender = !isAdmin && message.sender !== null;
  return (
    <View style={[styles.bubbleWrap, isAdmin ? styles.alignRight : styles.alignLeft]}>
      <View
        style={[
          styles.bubble,
          isAdmin ? styles.bubbleRight : styles.bubbleLeft,
        ]}
      >
        {!isAdmin ? (
          canTapSender ? (
            <Pressable
              onPress={() => message.sender && onPressSender(message.sender)}
              accessibilityRole="button"
              accessibilityLabel={`Options pour ${senderName}`}
              hitSlop={6}
            >
              <Text style={[styles.sender, styles.senderTappable]}>
                {senderName}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.sender}>{senderName}</Text>
          )
        ) : null}
        <Text
          style={[
            styles.body_text,
            isAdmin ? styles.bodyRight : styles.bodyLeft,
          ]}
        >
          {message.body}
        </Text>
        <Text
          style={[
            styles.time,
            isAdmin ? styles.timeRight : styles.timeLeft,
          ]}
        >
          {formatBubbleTime(message.createdAt)}
          {message.editedAt ? ' · modifié' : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: palette.primary,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  eyebrow: {
    ...typography.eyebrow,
    color: 'rgba(255,255,255,0.85)',
  },
  headerTitle: {
    ...typography.bodyStrong,
    color: palette.surface,
    marginTop: 2,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  loaderWrap: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  empty: { flex: 1, padding: spacing.huge },
  bubbleWrap: { flexDirection: 'row' },
  alignLeft: { justifyContent: 'flex-start' },
  alignRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    gap: 2,
  },
  bubbleLeft: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  bubbleRight: {
    backgroundColor: palette.primary,
    borderTopRightRadius: 4,
  },
  sender: {
    ...typography.smallStrong,
    fontSize: 12,
    color: palette.primary,
  },
  senderTappable: {
    textDecorationLine: 'underline',
  },
  body_text: { ...typography.body },
  bodyLeft: { color: palette.ink },
  bodyRight: { color: palette.surface },
  time: { ...typography.small, fontSize: 10, marginTop: 2 },
  timeLeft: { color: palette.muted },
  timeRight: { color: 'rgba(255,255,255,0.85)' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: palette.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: palette.bgAlt,
    ...typography.body,
    color: palette.ink,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
