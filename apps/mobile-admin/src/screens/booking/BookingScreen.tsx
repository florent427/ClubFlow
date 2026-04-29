import { useQuery } from '@apollo/client/react';
import {
  DataTable,
  ScreenContainer,
  ScreenHero,
  formatDateShort,
  formatRangeHours,
  palette,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { CLUB_COURSE_SLOTS } from '../../lib/documents/planning';
import type { BookingStackParamList } from '../../navigation/types';

type Slot = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  bookingEnabled: boolean;
  bookingCapacity: number | null;
  bookedCount: number;
  waitlistCount: number;
};

type Data = { clubCourseSlots: Slot[] };

type Nav = NativeStackNavigationProp<BookingStackParamList, 'Booking'>;

export function BookingScreen() {
  const navigation = useNavigation<Nav>();
  const { data, loading, refetch } = useQuery<Data>(CLUB_COURSE_SLOTS, {
    errorPolicy: 'all',
  });

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.clubCourseSlots ?? [];
    const bookable = list.filter((s) => s.bookingEnabled);
    const sorted = [...bookable].sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
    return sorted.map((slot) => {
      const full =
        slot.bookingCapacity != null &&
        slot.bookedCount >= slot.bookingCapacity;
      const cap = slot.bookingCapacity ?? '∞';
      return {
        key: slot.id,
        title: slot.title,
        subtitle: `${formatDateShort(slot.startsAt)} · ${formatRangeHours(
          slot.startsAt,
          slot.endsAt,
        )}`,
        badge: full
          ? {
              label: `Complet (${slot.bookedCount}/${cap})`,
              color: palette.dangerText,
              bg: palette.dangerBg,
            }
          : {
              label: `${slot.bookedCount}/${cap}`,
              color: palette.successText,
              bg: palette.successBg,
            },
      };
    });
  }, [data]);

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="RÉSERVATIONS"
        title="Réservations"
        subtitle={`${rows.length} créneaux réservables`}
        compact
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Aucun créneau réservable"
        emptySubtitle="Activez les réservations sur vos créneaux pour qu'ils apparaissent ici."
        emptyIcon="key-outline"
        onPressRow={(id) =>
          navigation.navigate('BookingSlotDetail', { slotId: id })
        }
      />
    </ScreenContainer>
  );
}
