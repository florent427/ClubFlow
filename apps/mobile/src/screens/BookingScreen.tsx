import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  VIEWER_BOOKABLE_COURSE_SLOTS,
  VIEWER_BOOK_COURSE_SLOT,
  VIEWER_CANCEL_COURSE_SLOT_BOOKING,
} from '../lib/viewer-documents';
import type {
  ViewerBookableCourseSlotsData,
  ViewerBookableSlot,
} from '../lib/viewer-types';

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function SlotCard({
  slot,
  refetch,
}: {
  slot: ViewerBookableSlot;
  refetch: () => void;
}) {
  const [book, { loading: b }] = useMutation(VIEWER_BOOK_COURSE_SLOT);
  const [cancel, { loading: c }] = useMutation(VIEWER_CANCEL_COURSE_SLOT_BOOKING);
  const [err, setErr] = useState<string | null>(null);

  const booked = slot.viewerBookingStatus === 'BOOKED';
  const wait = slot.viewerBookingStatus === 'WAITLISTED';
  const full =
    slot.bookingCapacity !== null && slot.bookedCount >= slot.bookingCapacity;

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

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{slot.title}</Text>
        {booked ? (
          <Text style={styles.pillOk}>Réservé</Text>
        ) : wait ? (
          <Text style={styles.pillWarn}>En attente</Text>
        ) : null}
      </View>
      <Text style={styles.meta}>
        {fmtDate(slot.startsAt)} – {fmtTime(slot.endsAt)}
      </Text>
      <Text style={styles.meta}>
        {slot.venueName} · {slot.coachFirstName} {slot.coachLastName}
      </Text>
      <Text style={styles.meta}>
        {slot.bookedCount}
        {slot.bookingCapacity !== null ? ` / ${slot.bookingCapacity}` : ''} inscrit
        {slot.waitlistCount > 0 ? ` (+${slot.waitlistCount} attente)` : ''}
      </Text>
      {err ? <Text style={styles.err}>{err}</Text> : null}
      {booked || wait ? (
        <Pressable
          onPress={() => void onCancel()}
          style={styles.btnGhost}
          disabled={c}
        >
          <Text style={styles.btnGhostText}>Annuler la réservation</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => void onBook()} style={styles.btn} disabled={b}>
          <Text style={styles.btnText}>
            {full ? 'Rejoindre la liste d’attente' : 'Réserver'}
          </Text>
        </Pressable>
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
    <FlatList
      contentContainerStyle={styles.list}
      data={slots}
      keyExtractor={(s) => s.id}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void refetch()} />
      }
      renderItem={({ item }) => (
        <SlotCard slot={item} refetch={() => void refetch()} />
      )}
      ListEmptyComponent={
        <Text style={styles.muted}>Aucun créneau réservable pour l’instant.</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 10,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
    marginRight: 8,
  },
  meta: { fontSize: 13, color: '#475569', marginTop: 4 },
  pillOk: {
    backgroundColor: '#dcfce7',
    color: '#15803d',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    fontWeight: '600',
  },
  pillWarn: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    fontWeight: '600',
  },
  btn: {
    marginTop: 10,
    backgroundColor: '#1a237e',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600' },
  btnGhost: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#1a237e',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnGhostText: { color: '#1a237e', fontWeight: '600' },
  err: { color: '#dc2626', marginTop: 6 },
  muted: { color: '#64748b', textAlign: 'center', padding: 20 },
});
