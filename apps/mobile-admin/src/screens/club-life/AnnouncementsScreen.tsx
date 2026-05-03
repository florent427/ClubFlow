import { useMutation, useQuery } from '@apollo/client/react';
import {
  BottomActionBar,
  ConfirmSheet,
  DataTable,
  ScreenContainer,
  ScreenHero,
  formatDateTime,
  palette,
  spacing,
  type BottomAction,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  CLUB_ANNOUNCEMENTS,
  DELETE_CLUB_ANNOUNCEMENT,
  PUBLISH_CLUB_ANNOUNCEMENT,
} from '../../lib/documents/club-life';
import type { ClubLifeStackParamList } from '../../navigation/types';

type Announcement = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  publishedAt: string | null;
  createdAt: string;
};

type Data = { clubAnnouncements: Announcement[] };

type Nav = NativeStackNavigationProp<ClubLifeStackParamList, 'Announcements'>;

export function AnnouncementsScreen() {
  const navigation = useNavigation<Nav>();
  const { data, loading, refetch } = useQuery<Data>(CLUB_ANNOUNCEMENTS, {
    errorPolicy: 'all',
  });

  const [actionTarget, setActionTarget] = useState<Announcement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);

  const [publishAnnouncement, publishState] = useMutation(
    PUBLISH_CLUB_ANNOUNCEMENT,
    {
      refetchQueries: [{ query: CLUB_ANNOUNCEMENTS }],
    },
  );
  const [deleteAnnouncement, deleteState] = useMutation(
    DELETE_CLUB_ANNOUNCEMENT,
    {
      refetchQueries: [{ query: CLUB_ANNOUNCEMENTS }],
    },
  );

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.clubAnnouncements ?? [];
    const sorted = [...list].sort((a, b) => {
      // pinned first, then most recent createdAt
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return sorted.map((a) => ({
      key: a.id,
      title: a.title,
      subtitle: a.publishedAt
        ? `Publiée ${formatDateTime(a.publishedAt)}`
        : `Brouillon · créée ${formatDateTime(a.createdAt)}`,
      leading: a.pinned ? <PinBubble /> : null,
      badge: a.publishedAt
        ? {
            label: 'Publiée',
            color: palette.successText,
            bg: palette.successBg,
          }
        : {
            label: 'Brouillon',
            color: palette.warningText,
            bg: palette.warningBg,
          },
    }));
  }, [data]);

  const onLongPressRow = (id: string) => {
    const target = data?.clubAnnouncements?.find((a) => a.id === id);
    if (target) setActionTarget(target);
  };

  const actions = useMemo<BottomAction[]>(() => {
    if (!actionTarget) return [];
    return [
      ...(!actionTarget.publishedAt
        ? [
            {
              key: 'publish',
              label: 'Publier',
              icon: 'send-outline' as const,
              tone: 'primary' as const,
            },
          ]
        : []),
      {
        key: 'delete',
        label: 'Supprimer',
        icon: 'trash-outline' as const,
        tone: 'danger' as const,
      },
    ];
  }, [actionTarget]);

  const handleAction = (key: string) => {
    if (!actionTarget) return;
    const target = actionTarget;
    setActionTarget(null);
    if (key === 'publish') {
      void publishAnnouncement({ variables: { id: target.id } });
    } else if (key === 'delete') {
      setDeleteTarget(target);
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    void deleteAnnouncement({ variables: { id } })
      .then(() => setDeleteTarget(null))
      .catch(() => setDeleteTarget(null));
  };

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="VIE DU CLUB"
        title="Annonces"
        subtitle={`${data?.clubAnnouncements?.length ?? 0} annonces`}
        compact
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={() => void refetch()}
        refreshing={loading}
        emptyTitle="Aucune annonce"
        emptySubtitle="Diffusez infos pratiques et actualités à vos membres."
        emptyIcon="notifications-outline"
        onLongPressRow={onLongPressRow}
      />
      <Pressable
        onPress={() => navigation.navigate('NewAnnouncement')}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Nouvelle annonce"
      >
        <Ionicons name="add" size={28} color={palette.surface} />
      </Pressable>

      <BottomActionBar
        visible={!!actionTarget}
        onClose={() => setActionTarget(null)}
        title={actionTarget?.title}
        actions={actions}
        onAction={handleAction}
      />
      <ConfirmSheet
        visible={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Supprimer cette annonce ?"
        message={deleteTarget?.title}
        confirmLabel="Supprimer"
        destructive
        loading={deleteState.loading || publishState.loading}
      />
    </ScreenContainer>
  );
}

function PinBubble() {
  return (
    <View style={styles.pinBubble}>
      <Ionicons name="pin" size={18} color={palette.warningText} />
    </View>
  );
}

const styles = StyleSheet.create({
  pinBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.warningBg,
    alignItems: 'center',
    justifyContent: 'center',
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
