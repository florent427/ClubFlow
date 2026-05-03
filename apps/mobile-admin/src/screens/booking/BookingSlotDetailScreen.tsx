import { useQuery } from '@apollo/client/react';
import {
  Card,
  DataTable,
  EmptyState,
  Pill,
  ScreenContainer,
  ScreenHero,
  formatDateShort,
  formatDateTime,
  formatRangeHours,
  palette,
  spacing,
  typography,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  CLUB_COURSE_SLOTS,
  CLUB_COURSE_SLOT_BOOKINGS,
} from '../../lib/documents/planning';
import type { BookingStackParamList } from '../../navigation/types';

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

type Booking = {
  id: string;
  memberId: string;
  status: string;
  bookedAt: string;
  cancelledAt: string | null;
  note: string | null;
  displayName: string;
};

type SlotsData = { clubCourseSlots: Slot[] };
type BookingsData = { clubCourseSlotBookings: Booking[] };

type Rt = RouteProp<BookingStackParamList, 'BookingSlotDetail'>;

const STATUS_TONE: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  BOOKED: {
    label: 'Réservé',
    color: palette.successText,
    bg: palette.successBg,
  },
  WAITLIST: {
    label: 'Liste d\'attente',
    color: palette.warningText,
    bg: palette.warningBg,
  },
  CANCELLED: {
    label: 'Annulée',
    color: palette.dangerText,
    bg: palette.dangerBg,
  },
};

export function BookingSlotDetailScreen() {
  const route = useRoute<Rt>();
  const slotId = route.params.slotId;

  const slotsQuery = useQuery<SlotsData>(CLUB_COURSE_SLOTS, {
    errorPolicy: 'all',
  });
  const bookingsQuery = useQuery<BookingsData>(CLUB_COURSE_SLOT_BOOKINGS, {
    variables: { slotId },
    errorPolicy: 'all',
  });

  const slot = useMemo(
    () =>
      slotsQuery.data?.clubCourseSlots?.find((s) => s.id === slotId) ?? null,
    [slotsQuery.data, slotId],
  );

  const rows = useMemo<DataTableRow[]>(() => {
    const list = bookingsQuery.data?.clubCourseSlotBookings ?? [];
    return list.map((b) => {
      const tone = STATUS_TONE[b.status];
      return {
        key: b.id,
        title: b.displayName,
        subtitle: b.note ?? formatDateTime(b.bookedAt),
        badge: tone ?? null,
      };
    });
  }, [bookingsQuery.data]);

  if (slotsQuery.loading && !slot) {
    return (
      <ScreenContainer padding={0} scroll={false}>
        <ScreenHero
          eyebrow="CRÉNEAU"
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

  if (!slot) {
    return (
      <ScreenContainer padding={0} scroll={false}>
        <ScreenHero
          eyebrow="CRÉNEAU"
          title="Introuvable"
          showBack
          compact
        />
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="alert-circle-outline"
            title="Créneau introuvable"
            description="Ce créneau a peut-être été supprimé."
          />
        </View>
      </ScreenContainer>
    );
  }

  const full =
    slot.bookingCapacity != null && slot.bookedCount >= slot.bookingCapacity;

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="CRÉNEAU"
        title={slot.title}
        subtitle={`${formatDateShort(slot.startsAt)} · ${formatRangeHours(
          slot.startsAt,
          slot.endsAt,
        )}`}
        showBack
      />

      <View style={styles.body}>
        <Card title="Réservations">
          <View style={styles.statRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{slot.bookedCount}</Text>
              <Text style={styles.statLabel}>Inscrits</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>
                {slot.bookingCapacity ?? '∞'}
              </Text>
              <Text style={styles.statLabel}>Capacité</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{slot.waitlistCount}</Text>
              <Text style={styles.statLabel}>Liste d'attente</Text>
            </View>
          </View>
          <View style={styles.pills}>
            {slot.bookingEnabled ? (
              <Pill label="Réservations ouvertes" tone="success" />
            ) : (
              <Pill label="Réservations fermées" tone="neutral" />
            )}
            {full ? <Pill label="Complet" tone="danger" /> : null}
          </View>
        </Card>

        <Card title="Liste des inscrits" padding={0}>
          <DataTable
            data={rows}
            loading={bookingsQuery.loading}
            emptyTitle="Aucune réservation"
            emptySubtitle="Aucun adhérent inscrit pour le moment."
            emptyIcon="people-outline"
          />
        </Card>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  loaderWrap: { padding: spacing.xxl, alignItems: 'center' },
  emptyWrap: { padding: spacing.xxl },
  statRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: palette.bgAlt,
    borderRadius: 12,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  statValue: { ...typography.h2, color: palette.ink },
  statLabel: { ...typography.small, color: palette.muted },
  pills: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
});
