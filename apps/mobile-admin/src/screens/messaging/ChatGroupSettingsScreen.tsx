import { useMutation, useQuery } from '@apollo/client/react';
import {
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  Pill,
  ScreenContainer,
  ScreenHero,
  TextField,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import {
  ADMIN_ARCHIVE_CHAT_GROUP,
  ADMIN_UPDATE_CHAT_GROUP,
  CLUB_CHAT_ROOMS_ADMIN,
} from '../../lib/documents/messaging';
import type { MessagingStackParamList } from '../../navigation/types';

type ChannelMode = 'OPEN' | 'RESTRICTED' | 'READ_ONLY';

type Room = {
  id: string;
  kind: string;
  name: string | null;
  description: string | null;
  channelMode: ChannelMode | null;
  isBroadcastChannel: boolean;
  archivedAt: string | null;
  updatedAt: string;
};

type Data = { clubChatRoomsAdmin: Room[] };

type Nav = NativeStackNavigationProp<
  MessagingStackParamList,
  'ChatGroupSettings'
>;
type Rt = RouteProp<MessagingStackParamList, 'ChatGroupSettings'>;

const MODE_LABELS: Record<ChannelMode, string> = {
  OPEN: 'Ouvert',
  RESTRICTED: 'Restreint',
  READ_ONLY: 'Lecture seule',
};

const KIND_LABELS: Record<string, string> = {
  GROUP: 'Salon de groupe',
  COMMUNITY: 'Communauté',
  DIRECT: 'Discussion privée',
};

export function ChatGroupSettingsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const roomId = route.params.roomId;

  const { data, loading } = useQuery<Data>(CLUB_CHAT_ROOMS_ADMIN, {
    errorPolicy: 'all',
  });

  const room = useMemo(
    () => data?.clubChatRoomsAdmin?.find((r) => r.id === roomId) ?? null,
    [data, roomId],
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [channelMode, setChannelMode] = useState<ChannelMode>('OPEN');
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Synchronise le state local quand le room arrive
  useEffect(() => {
    if (!room) return;
    setName(room.name ?? '');
    setDescription(room.description ?? '');
    setChannelMode((room.channelMode ?? 'OPEN') as ChannelMode);
  }, [room]);

  const [updateGroup, { loading: saving }] = useMutation(
    ADMIN_UPDATE_CHAT_GROUP,
    { refetchQueries: [{ query: CLUB_CHAT_ROOMS_ADMIN }] },
  );
  const [archiveGroup, { loading: archiving }] = useMutation(
    ADMIN_ARCHIVE_CHAT_GROUP,
    { refetchQueries: [{ query: CLUB_CHAT_ROOMS_ADMIN }] },
  );

  const handleSave = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      Alert.alert('Nom invalide', 'Le nom doit faire entre 2 et 80 caractères.');
      return;
    }
    try {
      await updateGroup({
        variables: {
          input: {
            roomId,
            name: trimmed,
            description:
              description.trim().length > 0 ? description.trim() : null,
            channelMode,
          },
        },
      });
      Alert.alert('Sauvegardé', 'Les paramètres ont été mis à jour.');
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Sauvegarde impossible.');
    }
  };

  const handleArchive = async () => {
    try {
      await archiveGroup({ variables: { roomId } });
      setArchiveOpen(false);
      navigation.goBack();
    } catch (e: any) {
      setArchiveOpen(false);
      Alert.alert('Erreur', e?.message ?? 'Archivage impossible.');
    }
  };

  if (loading && !room) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="RÉGLAGES"
          title="Chargement…"
          showBack
          compact
        />
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={palette.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!room) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="RÉGLAGES"
          title="Salon introuvable"
          showBack
          compact
        />
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="alert-circle-outline"
            title="Salon introuvable"
            description="Ce salon a peut-être été archivé ou supprimé."
          />
        </View>
      </ScreenContainer>
    );
  }

  const archived = room.archivedAt != null;

  return (
    <ScreenContainer padding={0} keyboardAvoiding>
      <ScreenHero
        eyebrow="RÉGLAGES"
        title={room.name ?? 'Salon'}
        subtitle={KIND_LABELS[room.kind] ?? room.kind}
        showBack
        compact
      />

      <View style={styles.body}>
        {archived ? (
          <Pill label="Salon archivé" tone="warning" icon="archive-outline" />
        ) : null}

        <Card title="Identité">
          <View style={styles.fields}>
            <TextField
              label="Nom"
              value={name}
              onChangeText={setName}
              placeholder="Nom du salon"
              autoCapitalize="sentences"
            />
            <TextField
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="À quoi sert ce salon ?"
              multiline
              numberOfLines={4}
            />
          </View>
        </Card>

        <Card title="Mode">
          <View style={styles.pillsRow}>
            {(['OPEN', 'RESTRICTED', 'READ_ONLY'] as ChannelMode[]).map((m) => (
              <Pill
                key={m}
                label={MODE_LABELS[m]}
                tone={channelMode === m ? 'primary' : 'neutral'}
                onPress={() => setChannelMode(m)}
              />
            ))}
          </View>
          <Text style={styles.hint}>
            Type :{' '}
            {KIND_LABELS[room.kind] ?? room.kind}
            {room.isBroadcastChannel ? ' · Canal de diffusion' : ''}
          </Text>
        </Card>

        <Button
          label="Sauvegarder"
          variant="primary"
          icon="checkmark-circle-outline"
          onPress={handleSave}
          loading={saving}
          fullWidth
        />

        {!archived ? (
          <Button
            label="Archiver le salon"
            variant="danger"
            icon="archive-outline"
            onPress={() => setArchiveOpen(true)}
            fullWidth
          />
        ) : null}
      </View>

      <ConfirmSheet
        visible={archiveOpen}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={handleArchive}
        title="Archiver ce salon ?"
        message="Le salon sera masqué et plus aucun message ne pourra y être posté."
        confirmLabel="Archiver"
        destructive
        loading={archiving}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  fields: { gap: spacing.md },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hint: {
    ...typography.small,
    color: palette.muted,
    marginTop: spacing.sm,
  },
  loaderWrap: { padding: spacing.xxl, alignItems: 'center' },
  emptyWrap: { padding: spacing.xxl },
});
