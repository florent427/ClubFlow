import { useMutation, useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AnimatedPressable,
  Button,
  EmptyState,
  GradientButton,
  Skeleton,
} from '../../components/ui';
import {
  VIEWER_CHAT_ROOMS,
  VIEWER_UPDATE_MY_PSEUDO,
} from '../../lib/messaging-documents';
import { absolutizeMediaUrl } from '../../lib/absolutize-url';
import { authorColor, formatRoomDate, initials } from '../../lib/messaging-format';
import { palette, radius, spacing, typography } from '../../lib/theme';
import { useClubTheme } from '../../lib/theme-context';
import { VIEWER_ME } from '../../lib/viewer-documents';
import type { ViewerMeData } from '../../lib/viewer-types';
import {
  directPeer,
  roomLabel,
  type ChatRoomRow,
  type MessagingStackParamList,
} from './types';

export function MessagingHomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<MessagingStackParamList>>();
  const clubTheme = useClubTheme();
  const primary = clubTheme.isClubBranded
    ? clubTheme.palette.primary
    : palette.primary;

  const { data: meData } = useQuery<ViewerMeData>(VIEWER_ME);
  const { data: roomsData, loading, refetch } = useQuery<{
    viewerChatRooms: ChatRoomRow[];
  }>(VIEWER_CHAT_ROOMS, { fetchPolicy: 'cache-and-network' });

  const rooms = roomsData?.viewerChatRooms ?? [];
  const hasPseudo = Boolean(meData?.viewerMe?.pseudo?.trim());

  // **À la demande uniquement** — la modale pseudo n'apparaît plus
  // automatiquement à chaque visite de l'écran Chat. L'utilisateur
  // l'ouvre via le bouton avatar en header (icône person-circle en
  // haut à droite). Le pseudo reste optionnel ; pour les salons, le
  // backend tombe sur le prénom + initiale de nom si pas de pseudo.
  const [pseudoModalOpen, setPseudoModalOpen] = useState(false);
  const [pseudoDraft, setPseudoDraft] = useState('');
  const [pseudoError, setPseudoError] = useState<string | null>(null);
  const [updatePseudo, { loading: savingPseudo }] = useMutation(
    VIEWER_UPDATE_MY_PSEUDO,
  );

  // Synchronise le draft avec la valeur serveur quand elle arrive,
  // sans (jamais) rouvrir la modale automatiquement.
  useEffect(() => {
    if (meData?.viewerMe?.pseudo) setPseudoDraft(meData.viewerMe.pseudo);
  }, [meData?.viewerMe?.pseudo]);

  async function onSavePseudo() {
    setPseudoError(null);
    try {
      await updatePseudo({
        variables: { input: { pseudo: pseudoDraft.trim() } },
      });
      setPseudoModalOpen(false);
      void refetch();
    } catch (err: unknown) {
      setPseudoError(
        err instanceof Error ? err.message : 'Pseudo invalide.',
      );
    }
  }

  return (
    <View
      style={[
        styles.flex,
        { paddingTop: Math.max(insets.top, spacing.lg) },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messagerie</Text>
        <Pressable
          style={styles.headerBtn}
          onPress={() => setPseudoModalOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Modifier mon pseudo"
          hitSlop={8}
        >
          <Ionicons name="person-circle-outline" size={28} color={palette.muted} />
        </Pressable>
      </View>

      <FlatList
        data={rooms}
        keyExtractor={(r) => r.id}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <RoomRow
            room={item}
            primary={primary}
            viewerMemberId={meData?.viewerMe?.id ?? null}
            onPress={() =>
              navigation.navigate('MessagingThread', { roomId: item.id })
            }
          />
        )}
        // Padding bottom élargi pour ne pas que la FAB cache le dernier
        // élément (la FAB est positionnée en absolute en bas à droite).
        contentContainerStyle={{ paddingBottom: 96 }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyWrap}>
              <Skeleton height={68} borderRadius={radius.md} />
              <Skeleton height={68} borderRadius={radius.md} />
              <Skeleton height={68} borderRadius={radius.md} />
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="chatbubbles-outline"
                title="Aucun salon"
                description="Le club créera des salons de discussion bientôt. En attendant, démarrez une conversation avec un autre membre."
              />
            </View>
          )
        }
      />

      {/*
        FAB "Nouvelle conversation" — gradient primary en bas à droite,
        respecte l'inset bas (safe area + tab bar). Ouvre NewChatScreen
        avec recherche unifiée par pseudo / prénom / nom.
      */}
      <Pressable
        onPress={() => navigation.navigate('NewChat')}
        accessibilityRole="button"
        accessibilityLabel="Nouvelle conversation avec un membre"
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + spacing.xl },
          pressed && { opacity: 0.85 },
        ]}
      >
        <LinearGradient
          colors={[primary, palette.primaryDark ?? '#4338ca']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabInner}
        >
          <Ionicons name="create" size={22} color="#ffffff" />
        </LinearGradient>
      </Pressable>

      {/* Modal pseudo — toujours fermable, le pseudo est optionnel. */}
      <Modal
        visible={pseudoModalOpen}
        animationType="slide"
        onRequestClose={() => setPseudoModalOpen(false)}
        presentationStyle="pageSheet"
      >
        <View style={[styles.flex, { backgroundColor: palette.bg }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {hasPseudo ? 'Mon pseudo' : 'Choisir un pseudo'}
            </Text>
            <Pressable
              onPress={() => setPseudoModalOpen(false)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <Ionicons name="close" size={26} color={palette.muted} />
            </Pressable>
          </View>
          <View style={{ padding: spacing.xl, gap: spacing.lg }}>
            <Text style={styles.pseudoHint}>
              Visible des autres membres à la place de votre vrai nom.
              3 à 32 caractères, lettres + chiffres + underscore.
            </Text>
            <TextInput
              style={styles.input}
              value={pseudoDraft}
              onChangeText={setPseudoDraft}
              placeholder="ex. judoka75"
              placeholderTextColor={palette.mutedSoft}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={32}
            />
            {pseudoError ? (
              <Text style={styles.error}>{pseudoError}</Text>
            ) : null}
            <GradientButton
              label={savingPseudo ? 'Enregistrement…' : 'Enregistrer'}
              icon="checkmark-circle-outline"
              onPress={() => void onSavePseudo()}
              loading={savingPseudo}
              disabled={!pseudoDraft.trim()}
              fullWidth
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function RoomRow({
  room,
  primary,
  viewerMemberId,
  onPress,
}: {
  room: ChatRoomRow;
  primary: string;
  /** ID du membre courant — sert à identifier le peer dans les chats DIRECT. */
  viewerMemberId: string | null;
  onPress: () => void;
}) {
  const label = roomLabel(room, viewerMemberId);
  const isCommunity = room.kind === 'COMMUNITY';
  const isDirect = room.kind === 'DIRECT';
  const peer = directPeer(room, viewerMemberId);
  // Pour les chats DIRECT, on essaie d'abord la photo du peer ; sinon
  // fallback sur les initiales colorées.
  const peerPhoto = peer ? absolutizeMediaUrl(peer.photoUrl) : null;
  const subline =
    room.description ??
    (room.isBroadcastChannel
      ? 'Canal de diffusion'
      : isDirect
        ? 'Conversation privée'
        : `${room.members.length} membre${room.members.length > 1 ? 's' : ''}`);

  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir le salon ${label}`}
      style={styles.row}
      scale={0.98}
    >
      <View style={styles.rowInner}>
        {/* Avatar — gradient pour la communauté, photo pour DIRECT, initiales sinon */}
        {isCommunity ? (
          <LinearGradient
            colors={[primary, '#7c3aed']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatar}
          >
            <Ionicons name="people" size={22} color="#ffffff" />
          </LinearGradient>
        ) : isDirect && peerPhoto ? (
          <Image
            source={{ uri: peerPhoto }}
            style={styles.avatar}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: authorColor(
                  isDirect && peer ? peer.id : room.id,
                ),
              },
            ]}
          >
            <Text style={styles.avatarText}>{initials(label)}</Text>
          </View>
        )}

        <View style={styles.rowBody}>
          <View style={styles.rowHead}>
            <Text style={styles.roomName} numberOfLines={1}>
              {label}
              {room.isBroadcastChannel ? '  📣' : ''}
            </Text>
            <Text style={styles.roomDate}>
              {formatRoomDate(room.updatedAt)}
            </Text>
          </View>
          <Text style={styles.roomSub} numberOfLines={2}>
            {subline}
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: palette.surface,
  },
  headerTitle: { ...typography.h1, color: palette.ink, fontSize: 26 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  row: { backgroundColor: palette.surface },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontFamily: typography.bodyStrong.fontFamily,
    fontSize: 18,
  },

  rowBody: { flex: 1, gap: 2 },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  roomName: { ...typography.h3, color: palette.ink, flex: 1 },
  roomDate: { ...typography.caption, color: palette.muted },
  roomSub: { ...typography.small, color: palette.muted },

  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
    marginLeft: spacing.xl + 52 + spacing.md,
  },

  emptyWrap: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxxl,
    gap: spacing.md,
  },

  // FAB "Nouvelle conversation" — positionné en absolute en bas à droite
  // au-dessus de la tab bar (le `bottom` est calé via insets dans le JSX).
  fab: {
    position: 'absolute',
    right: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  fabInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

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
  pseudoHint: { ...typography.body, color: palette.body },
  input: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: palette.ink,
  },
  error: { ...typography.small, color: palette.danger },
});
