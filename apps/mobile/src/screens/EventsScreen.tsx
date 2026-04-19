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
  VIEWER_CANCEL_EVENT_REGISTRATION,
  VIEWER_CLUB_EVENTS,
  VIEWER_REGISTER_TO_EVENT,
} from '../lib/viewer-documents';
import type { ViewerClubEvent, ViewerClubEventsData } from '../lib/viewer-types';

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

function EventCard({ event, refetch }: { event: ViewerClubEvent; refetch: () => void }) {
  const [register, { loading: r }] = useMutation(VIEWER_REGISTER_TO_EVENT);
  const [cancel, { loading: c }] = useMutation(VIEWER_CANCEL_EVENT_REGISTRATION);
  const [err, setErr] = useState<string | null>(null);

  const registered = event.viewerRegistrationStatus === 'REGISTERED';
  const wait = event.viewerRegistrationStatus === 'WAITLISTED';
  const full = event.capacity !== null && event.registeredCount >= event.capacity;

  async function onReg() {
    setErr(null);
    try {
      await register({ variables: { eventId: event.id } });
      refetch();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
    }
  }
  async function onCancel() {
    setErr(null);
    try {
      await cancel({ variables: { eventId: event.id } });
      refetch();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{event.title}</Text>
        {registered ? (
          <Text style={styles.pillOk}>Inscrit</Text>
        ) : wait ? (
          <Text style={styles.pillWarn}>En attente</Text>
        ) : null}
      </View>
      <Text style={styles.meta}>
        {fmtDate(event.startsAt)}
        {event.location ? ` · ${event.location}` : ''}
      </Text>
      <Text style={styles.meta}>
        {event.registeredCount}
        {event.capacity !== null ? ` / ${event.capacity}` : ''} inscrit
        {event.waitlistCount > 0 ? ` (+${event.waitlistCount} attente)` : ''}
        {event.priceCents !== null
          ? ` · ${(event.priceCents / 100).toFixed(2).replace('.', ',')} €`
          : ' · Gratuit'}
      </Text>
      {event.description ? <Text style={styles.body}>{event.description}</Text> : null}
      {err ? <Text style={styles.err}>{err}</Text> : null}
      {registered || wait ? (
        <Pressable onPress={() => void onCancel()} style={styles.btnGhost} disabled={c}>
          <Text style={styles.btnGhostText}>Se désinscrire</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => void onReg()} style={styles.btn} disabled={r}>
          <Text style={styles.btnText}>
            {full ? 'Rejoindre la liste d’attente' : 'S’inscrire'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function EventsScreen() {
  const { data, refetch, loading } = useQuery<ViewerClubEventsData>(VIEWER_CLUB_EVENTS);
  const events = data?.viewerClubEvents ?? [];
  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={events}
      keyExtractor={(e) => e.id}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void refetch()} />
      }
      renderItem={({ item }) => (
        <EventCard event={item} refetch={() => void refetch()} />
      )}
      ListEmptyComponent={<Text style={styles.muted}>Aucun événement à venir.</Text>}
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
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: '#0f172a', flex: 1, marginRight: 8 },
  meta: { fontSize: 13, color: '#475569', marginTop: 4 },
  body: { fontSize: 14, color: '#334155', marginTop: 6 },
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
