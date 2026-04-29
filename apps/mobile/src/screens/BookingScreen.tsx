import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Button,
  EmptyState,
  Pill,
  ScreenHero,
  Skeleton,
} from '../components/ui';
import {
  VIEWER_BOOKABLE_COURSE_SLOTS,
  VIEWER_BOOK_COURSE_SLOT,
  VIEWER_CANCEL_COURSE_SLOT_BOOKING,
} from '../lib/viewer-documents';
import type {
  ViewerBookableCourseSlotsData,
  ViewerBookableSlot,
} from '../lib/viewer-types';
import {
  gradients,
  palette,
  radius,
  shadow,
  spacing,
  typography,
} from '../lib/theme';

function fmtDay(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return iso;
  }
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function BookingSlotCard({
  slot,
  refetch,
}: {
  slot: ViewerBookableSlot;
  refetch: () => void;
}) {
  const [book, { loading: booking }] = useMutation(VIEWER_BOOK_COURSE_SLOT);
  const [cancel, { loading: cancelling }] = useMutation(
    VIEWER_CANCEL_COURSE_SLOT_BOOKING,
  );
  const [err, setErr] = useState<string | null>(null);

  const booked = slot.viewerBookingStatus === 'BOOKED';
  const wait = slot.viewerBookingStatus === 'WAITLISTED';
  const full =
    slot.bookingCapacity !== null && slot.bookedCount >= slot.bookingCapacity;
  const fillRatio = slot.bookingCapacity
    ? Math.min(slot.bookedCount / slot.bookingCapacity, 1)
    : null;

  async function onBook() {
    setErr(null);
    try {
      await book({ variables: { slotId: slot.id } });
      refetch();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
    }
  }
  async function onCancel() {
    setErr(null);
    try {
      await cancel({ variables: { slotId: slot.id } });
      refetch();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
    }
  }

  const dayLabel = fmtDay(slot.startsAt);
  const cap = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <LinearGradient
          colors={gradients.primary.colors}
          start={gradients.primary.start}
          end={gradients.primary.end}
          style={styles.timeBlock}
        >
          <Text style={styles.timeText}>{fmtTime(slot.startsAt)}</Text>
          <Text style={styles.timeSub}>→ {fmtTime(slot.endsAt)}</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={styles.dayLabel}>{cap}</Text>
          <Text style={styles.slotTitle} numberOfLines={1}>
            {slot.title}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color={palette.muted} />
            <Text style={styles.meta} numberOfLines={1}>
              {slot.venueName}
            </Text>
          </View>
          {slot.coachFirstName ? (
            <View style={styles.metaRow}>
              <Ionicons name="person-outline" size={13} color={palette.muted} />
              <Text style={styles.meta}>
                {slot.coachFirstName} {slot.coachLastName ?? ''}
              </Text>
            </View>
          ) : null}
        </View>
        {booked ? (
          <Pill tone="success" icon="checkmark-circle" label="Réservé" />
        ) : wait ? (
          <Pill tone="warning" icon="time-outline" label="Attente" />
        ) : null}
      </View>

      {/* Capacity bar */}
      {fillRatio !== null ? (
        <View style={styles.capacityBlock}>
          <View style={styles.capacityHead}>
            <Text style={styles.capacityText}>
              {slot.bookedCount} / {slot.bookingCapacity} inscrits
              {slot.waitlistCount > 0
                ? `  ·  ${slot.waitlistCount} en attente`
                : ''}
            </Text>
          </View>
          <View style={styles.capacityTrack}>
            <View
              style={[
                styles.capacityFill,
                {
                  width: `${fillRatio * 100}%`,
                  backgroundColor:
                    fillRatio >= 1 ? palette.warning : palette.primary,
                },
              ]}
            />
          </View>
        </View>
      ) : null}

      {err ? <Text style={styles.err}>{err}</Text> : null}

      {booked || wait ? (
        <Button
          label="Annuler la réservation"
          onPress={() => void onCancel()}
          variant="ghost"
          fullWidth
          loading={cancelling}
          icon="close-circle-outline"
        />
      ) : (
        <Button
          label={full ? "Liste d'attente" : 'Réserver'}
          onPress={() => void onBook()}
          loading={booking}
          fullWidth
          icon="checkmark-circle-outline"
          variant={full ? 'secondary' : 'primary'}
        />
      )}
    </View>
  );
}

export function BookingScreen() {
  const { data, refetch, loading } = useQuery<ViewerBookableCourseSlotsData>(
    VIEWER_BOOKABLE_COURSE_SLOTS,
  );
  const slots = data?.viewerBookableCourseSlots ?? [];

  return (
    <View style={styles.flex}>
      <ScreenHero
        eyebrow="RÉSERVATIONS"
        title="Cours à réserver"
        subtitle={
          slots.length > 0
            ? `${slots.length} créneau${slots.length > 1 ? 'x' : ''} disponible${slots.length > 1 ? 's' : ''}`
            : 'Réservez vos prochains cours.'
        }
        gradient="hero"
        overlap
      />
      <FlatList
        style={styles.flex}
        contentContainerStyle={styles.list}
        data={slots}
        keyExtractor={(s) => s.id}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refetch()}
            tintColor={palette.primary}
          />
        }
        renderItem={({ item }) => (
          <BookingSlotCard slot={item} refetch={() => void refetch()} />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: spacing.md }}>
              <Skeleton height={140} borderRadius={radius.xl} />
              <Skeleton height={140} borderRadius={radius.xl} />
            </View>
          ) : (
            <EmptyState
              icon="calendar-outline"
              title="Aucun créneau réservable"
              description="Les cours ouverts à la réservation apparaîtront ici."
              variant="card"
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
    marginTop: -spacing.md,
    gap: spacing.md,
  },

  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    gap: spacing.md,
    ...shadow.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  timeBlock: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  timeText: {
    color: '#ffffff',
    fontSize: 16,
    fontFamily: typography.bodyStrong.fontFamily,
    letterSpacing: -0.3,
  },
  timeSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
  },
  dayLabel: {
    ...typography.caption,
    color: palette.muted,
  },
  slotTitle: {
    ...typography.h3,
    color: palette.ink,
    marginTop: 2,
    marginBottom: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  meta: { ...typography.small, color: palette.muted },

  capacityBlock: { gap: spacing.xs },
  capacityHead: { flexDirection: 'row', justifyContent: 'space-between' },
  capacityText: { ...typography.caption, color: palette.muted },
  capacityTrack: {
    height: 6,
    backgroundColor: palette.bgAlt,
    borderRadius: 3,
    overflow: 'hidden',
  },
  capacityFill: {
    height: '100%',
    borderRadius: 3,
  },
  err: { ...typography.small, color: palette.danger },
});
