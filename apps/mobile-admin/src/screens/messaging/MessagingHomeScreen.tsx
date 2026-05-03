import { useMutation, useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  BottomActionBar,
  ConfirmSheet,
  DataTable,
  FilterChipBar,
  ScreenContainer,
  ScreenHero,
  SearchBar,
  memberDisplayName,
  memberInitials,
  palette,
  spacing,
  typography,
  useDebounced,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ADMIN_ARCHIVE_CHAT_GROUP,
  CLUB_CHAT_ROOMS_ADMIN,
  VIEWER_GET_OR_CREATE_DIRECT_CHAT,
} from '../../lib/documents/messaging';
import { CLUB_MEMBERS } from '../../lib/documents/members';

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

type RoomsData = { clubChatRoomsAdmin: Room[] };

type FullMember = {
  id: string;
  firstName: string;
  lastName: string;
  pseudo: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  photoUrl: string | null;
  gradeLevel: { id: string; label: string } | null;
};

type MembersData = { clubMembers: FullMember[] };

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

type Mode = 'rooms' | 'members';

const MODE_CHIPS = [
  { key: 'rooms' as const, label: 'Salons' },
  { key: 'members' as const, label: 'Membres' },
];

export function MessagingHomeScreen() {
  const nav = useNavigation();
  const [mode, setMode] = useState<Mode>('rooms');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 200);
  const [actionTargetId, setActionTargetId] = useState<string | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [openingDmFor, setOpeningDmFor] = useState<string | null>(null);

  const { data: roomsData, loading: roomsLoading, refetch: refetchRooms } =
    useQuery<RoomsData>(CLUB_CHAT_ROOMS_ADMIN, { errorPolicy: 'all' });
  const { data: membersData, loading: membersLoading, refetch: refetchMembers } =
    useQuery<MembersData>(CLUB_MEMBERS, { errorPolicy: 'all' });

  const [archiveRoom, { loading: archiving }] = useMutation(
    ADMIN_ARCHIVE_CHAT_GROUP,
  );
  const [getOrCreateDirect] = useMutation(VIEWER_GET_OR_CREATE_DIRECT_CHAT);

  const rooms = roomsData?.clubChatRoomsAdmin ?? [];
  const members = (membersData?.clubMembers ?? []).filter(
    (m) => m.status === 'ACTIVE',
  );
  const target = rooms.find((r) => r.id === actionTargetId) ?? null;

  const roomRows = useMemo<DataTableRow[]>(() => {
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
        leading: (
          <View style={dotStyles.bubble}>
            <Ionicons
              name={
                r.kind === 'DIRECT' || r.kind === 'DM'
                  ? 'person-outline'
                  : 'chatbubbles-outline'
              }
              size={20}
              color={palette.primary}
            />
          </View>
        ),
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

  const memberRows = useMemo<DataTableRow[]>(() => {
    const q = debounced.trim().toLowerCase();
    return members
      .filter((m) => {
        if (q.length === 0) return true;
        const hay = [m.firstName, m.lastName, m.pseudo]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .map((m) => ({
        key: m.id,
        title: memberDisplayName(m),
        subtitle: m.gradeLevel?.label ?? null,
        leading: (
          <View style={dotStyles.avatar}>
            <Text style={dotStyles.avatarText}>{memberInitials(m)}</Text>
          </View>
        ),
        trailing:
          openingDmFor === m.id ? (
            <Ionicons
              name="hourglass-outline"
              size={20}
              color={palette.muted}
            />
          ) : (
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={20}
              color={palette.primary}
            />
          ),
      }));
  }, [members, debounced, openingDmFor]);

  const handleArchive = async () => {
    if (!confirmArchiveId) return;
    try {
      await archiveRoom({ variables: { roomId: confirmArchiveId } });
      setConfirmArchiveId(null);
      await refetchRooms();
    } catch (e: unknown) {
      Alert.alert(
        'Erreur',
        e instanceof Error ? e.message : 'Archivage impossible',
      );
    }
  };

  const onPickMember = async (memberId: string) => {
    if (openingDmFor) return;
    setOpeningDmFor(memberId);
    try {
      const res = await getOrCreateDirect({
        variables: { peerMemberId: memberId },
      });
      const roomId = (
        res.data as
          | { viewerGetOrCreateDirectChat?: { id: string } }
          | null
          | undefined
      )?.viewerGetOrCreateDirectChat?.id;
      if (!roomId) {
        throw new Error('Impossible d\'ouvrir la conversation.');
      }
      await refetchRooms();
      (nav as unknown as { navigate: (n: string, p: object) => void }).navigate(
        'MessagingThread',
        { roomId },
      );
    } catch (e: unknown) {
      Alert.alert(
        'Erreur',
        e instanceof Error
          ? e.message
          : 'Impossible d\'ouvrir le message privé.',
      );
    } finally {
      setOpeningDmFor(null);
    }
  };

  const isMembers = mode === 'members';
  const placeholder = isMembers
    ? 'Rechercher un membre…'
    : 'Rechercher un salon…';
  const subtitle = isMembers
    ? `${members.length} adhérent${members.length > 1 ? 's' : ''} actif${members.length > 1 ? 's' : ''}`
    : `${rooms.length} conversation${rooms.length > 1 ? 's' : ''}`;

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="MESSAGERIE"
        title={isMembers ? 'Nouveau message privé' : 'Salons'}
        subtitle={subtitle}
        compact
        showBack
      />

      <View style={styles.modeWrap}>
        <FilterChipBar
          chips={MODE_CHIPS}
          activeKey={mode}
          onSelect={(k) => {
            if (k === 'rooms' || k === 'members') setMode(k);
          }}
          withAll={false}
        />
      </View>

      <View style={styles.searchBar}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder={placeholder}
        />
      </View>

      {isMembers ? (
        <DataTable
          data={memberRows}
          loading={membersLoading}
          onRefresh={refetchMembers}
          refreshing={membersLoading}
          emptyTitle={
            debounced.length > 0 ? 'Aucun résultat' : 'Aucun adhérent'
          }
          emptySubtitle={
            debounced.length > 0
              ? `Aucun membre ne correspond à « ${debounced} ».`
              : 'Ajoutez des membres pour démarrer une conversation.'
          }
          emptyIcon={
            debounced.length > 0 ? 'search-outline' : 'people-outline'
          }
          onPressRow={(memberId) => void onPickMember(memberId)}
        />
      ) : (
        <DataTable
          data={roomRows}
          loading={roomsLoading}
          onRefresh={refetchRooms}
          refreshing={roomsLoading}
          emptyTitle="Aucun salon"
          emptySubtitle="Créez un salon ou démarrez une conversation privée depuis l'onglet Membres."
          emptyIcon="chatbubbles-outline"
          onPressRow={(id) =>
            (
              nav as unknown as { navigate: (n: string, p: object) => void }
            ).navigate('MessagingThread', { roomId: id })
          }
          onLongPressRow={(id) => setActionTargetId(id)}
        />
      )}

      {!isMembers ? (
        <Pressable
          onPress={() =>
            (nav as unknown as { navigate: (n: string) => void }).navigate(
              'NewChatGroup',
            )
          }
          style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="Nouveau salon"
        >
          <Ionicons name="add" size={28} color={palette.surface} />
        </Pressable>
      ) : null}

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
  modeWrap: {
    paddingTop: spacing.sm,
  },
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

const dotStyles = StyleSheet.create({
  bubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.smallStrong,
    color: palette.surface,
  },
});
