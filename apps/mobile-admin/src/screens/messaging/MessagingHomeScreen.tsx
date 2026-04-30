import { useMutation, useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  BottomActionBar,
  ConfirmSheet,
  DataTable,
  ScreenContainer,
  ScreenHero,
  SearchBar,
  memberDisplayName,
  palette,
  spacing,
  useDebounced,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import {
  ADMIN_ARCHIVE_CHAT_GROUP,
  CLUB_CHAT_ROOMS_ADMIN,
} from '../../lib/documents/messaging';

type Member = {
  id: string;
  pseudo: string | null;
  firstName: string | null;
  lastName: string | null;
};

type RoomMember = {
  memberId: string;
  role: string;
  member: Member | null;
};

type Room = {
  id: string;
  kind: string;
  name: string | null;
  description: string | null;
  channelMode: string | null;
  isBroadcastChannel: boolean;
  archivedAt: string | null;
  updatedAt: string;
  members: RoomMember[];
  viewerCanPost: boolean;
  viewerCanReply: boolean;
};

type Data = { clubChatRoomsAdmin: Room[] };

function roomDisplayName(room: Room): string {
  if (room.name && room.name.length > 0) return room.name;
  if (room.kind === 'DIRECT' || room.kind === 'DM') {
    const labels = room.members
      .map((m) => (m.member ? memberDisplayName(m.member) : null))
      .filter(Boolean) as string[];
    if (labels.length > 0) return labels.join(', ');
  }
  return 'Salon sans nom';
}

export function MessagingHomeScreen() {
  const nav = useNavigation();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 200);
  const [actionTargetId, setActionTargetId] = useState<string | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);

  const { data, loading, refetch } = useQuery<Data>(CLUB_CHAT_ROOMS_ADMIN, {
    errorPolicy: 'all',
  });

  const [archiveRoom, { loading: archiving }] = useMutation(
    ADMIN_ARCHIVE_CHAT_GROUP,
  );

  const rooms = data?.clubChatRoomsAdmin ?? [];
  const target = rooms.find((r) => r.id === actionTargetId) ?? null;

  const rows = useMemo<DataTableRow[]>(() => {
    const q = debounced.trim().toLowerCase();
    return rooms
      .filter((r) => {
        if (q.length === 0) return true;
        return (
          roomDisplayName(r).toLowerCase().includes(q) ||
          (r.description?.toLowerCase().includes(q) ?? false)
        );
      })
      .map((r) => ({
        key: r.id,
        title: roomDisplayName(r),
        subtitle:
          r.description && r.description.length > 0
            ? r.description
            : `${r.members.length} participant${r.members.length > 1 ? 's' : ''}`,
        badge: r.archivedAt
          ? { label: 'Archivé', color: palette.muted, bg: palette.bgAlt }
          : r.isBroadcastChannel
            ? {
                label: 'Diffusion',
                color: palette.warningText,
                bg: palette.warningBg,
              }
            : null,
      }));
  }, [rooms, debounced]);

  const handleArchive = async () => {
    if (!confirmArchiveId) return;
    try {
      await archiveRoom({ variables: { roomId: confirmArchiveId } });
      setConfirmArchiveId(null);
      await refetch();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Archivage impossible');
    }
  };

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="MESSAGERIE"
        title="Salons"
        subtitle={`${rooms.length} conversation${rooms.length > 1 ? 's' : ''}`}
        compact
        showBack
      />
      <View style={styles.searchBar}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher un salon…"
        />
      </View>
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Aucun salon"
        emptySubtitle="Créez un salon pour démarrer une conversation."
        emptyIcon="chatbubbles-outline"
        onPressRow={(id) =>
          (nav as any).navigate('MessagingThread', { roomId: id })
        }
        onLongPressRow={(id) => setActionTargetId(id)}
      />
      <Pressable
        onPress={() => (nav as any).navigate('NewChatGroup')}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Nouveau salon"
      >
        <Ionicons name="add" size={28} color={palette.surface} />
      </Pressable>

      <BottomActionBar
        visible={actionTargetId != null}
        onClose={() => setActionTargetId(null)}
        title={target ? roomDisplayName(target) : undefined}
        actions={[
          {
            key: 'archive',
            label: target?.archivedAt ? 'Déjà archivé' : 'Archiver le salon',
            icon: 'archive-outline',
            tone: 'danger',
            disabled: target?.archivedAt != null || archiving,
          },
        ]}
        onAction={(key) => {
          const id = actionTargetId;
          setActionTargetId(null);
          if (!id) return;
          if (key === 'archive') setConfirmArchiveId(id);
        }}
      />
      <ConfirmSheet
        visible={confirmArchiveId != null}
        onCancel={() => setConfirmArchiveId(null)}
        onConfirm={handleArchive}
        title="Archiver le salon ?"
        message="Les membres ne pourront plus poster, mais l'historique sera conservé."
        confirmLabel="Archiver"
        destructive
        loading={archiving}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
