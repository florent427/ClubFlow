import { useMutation, useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AnimatedPressable,
  EmptyState,
  FilterChipBar,
  GradientButton,
  ScreenHero,
  formatDateShort,
  palette,
  radius,
  spacing,
  typography,
  type FilterChip,
} from '@clubflow/mobile-shared';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AGENT_CONVERSATIONS,
  AGENT_MESSAGES,
  SEND_AGENT_MESSAGE,
  START_AGENT_CONVERSATION,
} from '../../lib/documents/agent';

type Role = 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';

type Conversation = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

type Message = {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
};

type ConversationsData = { agentConversations: Conversation[] };
type MessagesData = { agentMessages: Message[] };

export function AikoChatScreen() {
  const insets = useSafeAreaInsets();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const {
    data: convData,
    loading: convLoading,
    refetch: refetchConv,
  } = useQuery<ConversationsData>(AGENT_CONVERSATIONS, {
    errorPolicy: 'all',
  });

  const conversations = convData?.agentConversations ?? [];

  // Sélectionne automatiquement la dernière conversation si rien n'est actif.
  useEffect(() => {
    if (activeId == null && conversations.length > 0) {
      setActiveId(conversations[0].id);
    }
  }, [conversations, activeId]);

  const {
    data: msgData,
    loading: msgLoading,
    refetch: refetchMessages,
  } = useQuery<MessagesData>(AGENT_MESSAGES, {
    variables: { conversationId: activeId ?? '' },
    skip: activeId == null,
    errorPolicy: 'all',
  });

  const messages = msgData?.agentMessages ?? [];

  const [startConversation, startState] = useMutation(START_AGENT_CONVERSATION, {
    refetchQueries: [{ query: AGENT_CONVERSATIONS }],
  });
  const [sendMessage, sendState] = useMutation(SEND_AGENT_MESSAGE);

  const handleStart = async () => {
    try {
      const res = await startConversation({
        variables: { input: {} },
      });
      const newId =
        (res.data as { startAgentConversation?: { id: string } } | null | undefined)
          ?.startAgentConversation?.id;
      if (newId) {
        setActiveId(newId);
        await refetchConv();
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible de créer la conversation.');
    }
  };

  const handleSend = async () => {
    const content = draft.trim();
    if (content.length === 0 || activeId == null) return;
    try {
      setDraft('');
      await sendMessage({
        variables: { input: { conversationId: activeId, content } },
      });
      await refetchMessages();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? "Envoi impossible.");
      // Restaure le brouillon en cas d'erreur.
      setDraft(content);
    }
  };

  const conversationChips: FilterChip[] = conversations.map((c) => ({
    key: c.id,
    label: c.title ?? `Conversation ${formatDateShort(c.createdAt)}`,
  }));

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScreenHero
        eyebrow="AÏKO"
        title="Agent IA"
        subtitle="Votre assistant de gestion"
        compact
        trailing={
          <AnimatedPressable
            onPress={() => void handleStart()}
            accessibilityRole="button"
            accessibilityLabel="Nouvelle conversation"
            style={styles.iconBtn}
          >
            <Ionicons name="add" size={22} color="#ffffff" />
          </AnimatedPressable>
        }
      />

      {conversations.length > 0 ? (
        <FilterChipBar
          chips={conversationChips}
          activeKey={activeId}
          onSelect={(k) => setActiveId(k)}
          withAll={false}
        />
      ) : null}

      <View style={styles.body}>
        {convLoading && conversations.length === 0 ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : conversations.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="sparkles-outline"
              title="Aucune conversation"
              description="Démarrez votre première discussion avec Aïko pour piloter votre club par la voix."
              action={
                <GradientButton
                  label="Commencer"
                  icon="chatbubbles-outline"
                  onPress={() => void handleStart()}
                  loading={startState.loading}
                />
              }
            />
          </View>
        ) : activeId == null ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="chatbubbles-outline"
              title="Sélectionnez une conversation"
              description="Choisissez une discussion existante ou démarrez-en une nouvelle."
            />
          </View>
        ) : msgLoading && messages.length === 0 ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="chatbubble-ellipses-outline"
              title="Conversation vide"
              description="Posez votre première question à Aïko."
            />
          </View>
        ) : (
          <FlatList
            data={[...messages].reverse()}
            inverted
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.messagesContainer}
            renderItem={({ item }) => <Bubble message={item} />}
            refreshing={msgLoading}
            onRefresh={() => void refetchMessages()}
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
          placeholder={
            activeId == null
              ? 'Démarrez une conversation pour écrire…'
              : 'Posez votre question à Aïko…'
          }
          placeholderTextColor={palette.mutedSoft}
          multiline
          editable={activeId != null}
          style={styles.input}
        />
        <AnimatedPressable
          onPress={() => void handleSend()}
          disabled={
            sendState.loading || draft.trim().length === 0 || activeId == null
          }
          haptic
          accessibilityRole="button"
          accessibilityLabel="Envoyer"
          style={[
            styles.sendBtn,
            (sendState.loading ||
              draft.trim().length === 0 ||
              activeId == null) && {
              opacity: 0.4,
            },
          ]}
        >
          {sendState.loading ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Ionicons name="send" size={20} color="#ffffff" />
          )}
        </AnimatedPressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message }: { message: Message }) {
  const isUser = message.role === 'USER';
  return (
    <View style={[styles.bubbleWrap, isUser ? styles.alignRight : styles.alignLeft]}>
      <View style={[styles.bubble, isUser ? styles.bubbleRight : styles.bubbleLeft]}>
        <Text style={[styles.bubbleText, isUser ? styles.textRight : styles.textLeft]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.huge,
  },
  emptyWrap: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  messagesContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  bubbleWrap: { flexDirection: 'row' },
  alignLeft: { justifyContent: 'flex-start' },
  alignRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
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
  bubbleText: { ...typography.body },
  textLeft: { color: palette.ink },
  textRight: { color: '#ffffff' },
  composer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: palette.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: palette.bgAlt,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: palette.ink,
    ...typography.body,
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
