import { useQuery } from '@apollo/client/react';
import {
  DataTable,
  ScreenContainer,
  ScreenHero,
  formatDateShort,
  formatRangeHours,
  palette,
  spacing,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CLUB_COURSE_SLOTS } from '../../lib/documents/planning';
import type { PlanningStackParamList } from '../../navigation/types';

type Slot = {
  id: string;
  venueId: string;
  coachMemberId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  bookingEnabled: boolean;
  bookingCapacity: number | null;
  bookedCount: number;
  waitlistCount: number;
};

type Data = { clubCourseSlots: Slot[] };

type Nav = NativeStackNavigationProp<PlanningStackParamList, 'Planning'>;

export function PlanningScreen() {
  const navigation = useNavigation<Nav>();
  const { data, loading, refetch } = useQuery<Data>(CLUB_COURSE_SLOTS, {
    errorPolicy: 'all',
  });

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.clubCourseSlots ?? [];
    const sorted = [...list].sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
    return sorted.map((slot) => {
      const full =
        slot.bookingCapacity != null &&
        slot.bookedCount >= slot.bookingCapacity;
      return {
        key: slot.id,
        title: slot.title,
        subtitle: `${formatDateShort(slot.startsAt)} · ${formatRangeHours(
          slot.startsAt,
          slot.endsAt,
        )}`,
        badge: full
          ? {
              label: 'Complet',
              color: palette.dangerText,
              bg: palette.dangerBg,
            }
          : slot.bookingEnabled
            ? {
                label: `${slot.bookedCount}/${slot.bookingCapacity ?? '∞'}`,
                color: palette.successText,
                bg: palette.successBg,
              }
            : null,
      };
    });
  }, [data]);

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="PLANNING"
        title="Planning sportif"
        subtitle={`${data?.clubCourseSlots?.length ?? 0} créneaux`}
        compact
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Aucun créneau"
        emptySubtitle="Créez votre premier créneau de cours."
        emptyIcon="calendar-outline"
        onPressRow={(id) =>
          navigation.navigate('CourseSlotDetail', { slotId: id })
        }
      />
      <Pressable
        onPress={() => navigation.navigate('NewCourseSlot')}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Nouveau créneau"
      >
        <Ionicons name="add" size={28} color={palette.surface} />
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
