import { useQuery } from '@apollo/client/react';
import {
  DataTable,
  FilterChipBar,
  ScreenContainer,
  ScreenHero,
  formatDateTime,
  palette,
  spacing,
  type DataTableRow,
  type FilterChip,
} from '@clubflow/mobile-shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CLUB_EVENTS } from '../../lib/documents/events';
import type { EventsStackParamList } from '../../navigation/types';

type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED';

type Event = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  priceCents: number | null;
  status: EventStatus;
  publishedAt: string | null;
  registeredCount: number;
  waitlistCount: number;
};

type Data = { clubEvents: Event[] };

type Nav = NativeStackNavigationProp<EventsStackParamList, 'Events'>;

const STATUS_LABEL: Record<EventStatus, string> = {
  DRAFT: 'Brouillon',
  PUBLISHED: 'Publié',
  CANCELLED: 'Annulé',
};

const STATUS_COLOR: Record<
  EventStatus,
  { color: string; bg: string }
> = {
  DRAFT: { color: palette.warningText, bg: palette.warningBg },
  PUBLISHED: { color: palette.successText, bg: palette.successBg },
  CANCELLED: { color: palette.dangerText, bg: palette.dangerBg },
};

const STATUS_CHIPS: FilterChip[] = [
  { key: 'DRAFT', label: 'Brouillons' },
  { key: 'PUBLISHED', label: 'Publiés' },
  { key: 'CANCELLED', label: 'Annulés' },
];

export function EventsScreen() {
  const navigation = useNavigation<Nav>();
  const [filter, setFilter] = useState<string | null>(null);
  const { data, loading, refetch } = useQuery<Data>(CLUB_EVENTS, {
    errorPolicy: 'all',
  });

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.clubEvents ?? [];
    const filtered = filter ? list.filter((e) => e.status === filter) : list;
    const sorted = [...filtered].sort(
      (a, b) =>
        new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
    );
    return sorted.map((e) => {
      const cap = e.capacity != null ? `${e.registeredCount}/${e.capacity}` : `${e.registeredCount}`;
      return {
        key: e.id,
        title: e.title,
        subtitle: formatDateTime(e.startsAt),
        badge: {
          label: cap,
          ...STATUS_COLOR[e.status],
        },
      };
    });
  }, [data, filter]);

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="ÉVÉNEMENTS"
        title="Agenda"
        subtitle={`${data?.clubEvents?.length ?? 0} événements`}
        compact
      />
      <View style={styles.filterWrap}>
        <FilterChipBar
          chips={STATUS_CHIPS}
          activeKey={filter}
          onSelect={setFilter}
        />
      </View>
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={() => void refetch()}
        refreshing={loading}
        emptyTitle={filter ? `Aucun événement ${STATUS_LABEL[filter as EventStatus].toLowerCase()}` : 'Aucun événement'}
        emptySubtitle="Créez votre premier stage, compétition ou rassemblement."
        emptyIcon="trophy-outline"
        onPressRow={(id) => navigation.navigate('EventDetail', { eventId: id })}
      />
      <Pressable
        onPress={() => navigation.navigate('NewEvent')}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Créer un événement"
      >
        <Ionicons name="add" size={28} color={palette.surface} />
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  filterWrap: {
    paddingTop: spacing.sm,
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
