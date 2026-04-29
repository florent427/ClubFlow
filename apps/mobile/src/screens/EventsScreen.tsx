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
  VIEWER_CANCEL_EVENT_REGISTRATION,
  VIEWER_CLUB_EVENTS,
  VIEWER_REGISTER_TO_EVENT,
} from '../lib/viewer-documents';
import type {
  ViewerClubEvent,
  ViewerClubEventsData,
} from '../lib/viewer-types';
import {
  gradients,
  palette,
  radius,
  shadow,
  spacing,
  typography,
} from '../lib/theme';

function fmtDateBlock(iso: string): { day: string; month: string } {
  try {
    const d = new Date(iso);
    return {
      day: String(d.getDate()),
      month: d
        .toLocaleDateString('fr-FR', { month: 'short' })
        .replace('.', '')
        .toUpperCase(),
    };
  } catch {
    return { day: '?', month: '' };
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

function EventCard({
  event,
  refetch,
}: {
  event: ViewerClubEvent;
  refetch: () => void;
}) {
  const [register, { loading: r }] = useMutation(VIEWER_REGISTER_TO_EVENT);
  const [cancel, { loading: c }] = useMutation(VIEWER_CANCEL_EVENT_REGISTRATION);
  const [err, setErr] = useState<string | null>(null);

  const registered = event.viewerRegistrationStatus === 'REGISTERED';
  const wait = event.viewerRegistrationStatus === 'WAITLISTED';
  const full = event.capacity !== null && event.registeredCount >= event.capacity;
  const dateBlock = fmtDateBlock(event.startsAt);

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
      <View style={styles.headerRow}>
        <LinearGradient
          colors={gradients.warm.colors}
          start={gradients.warm.start}
          end={gradients.warm.end}
          style={styles.dateBlock}
        >
          <Text style={styles.dateMonth}>{dateBlock.month}</Text>
          <Text style={styles.dateDay}>{dateBlock.day}</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={2}>
            {event.title}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={13} color={palette.muted} />
            <Text style={styles.meta}>{fmtTime(event.startsAt)}</Text>
          </View>
          {event.location ? (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={13} color={palette.muted} />
              <Text style={styles.meta} numberOfLines={1}>
                {event.location}
              </Text>
            </View>
          ) : null}
        </View>
        {registered ? (
          <Pill tone="success" icon="checkmark-circle" label="Inscrit" />
        ) : wait ? (
          <Pill tone="warning" icon="time-outline" label="Attente" />
        ) : null}
      </View>

      {event.description ? (
        <Text style={styles.body} numberOfLines={3}>
          {event.description}
        </Text>
      ) : null}

      <View style={styles.statRow}>
        <View style={styles.statItem}>
          <Ionicons name="people-outline" size={14} color={palette.muted} />
          <Text style={styles.statText}>
            {event.registeredCount}
            {event.capacity !== null ? ` / ${event.capacity}` : ''}
          </Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="cash-outline" size={14} color={palette.muted} />
          <Text style={styles.statText}>
            {event.priceCents !== null
              ? `${(event.priceCents / 100).toFixed(2).replace('.', ',')} €`
              : 'Gratuit'}
          </Text>
        </View>
        {event.waitlistCount > 0 ? (
          <View style={styles.statItem}>
            <Ionicons name="hourglass-outline" size={14} color={palette.muted} />
            <Text style={styles.statText}>
              +{event.waitlistCount} attente
            </Text>
          </View>
        ) : null}
      </View>

      {err ? <Text style={styles.err}>{err}</Text> : null}

      {registered || wait ? (
        <Button
          label="Se désinscrire"
          onPress={() => void onCancel()}
          variant="ghost"
          loading={c}
          fullWidth
          icon="close-circle-outline"
        />
      ) : (
        <Button
          label={full ? "Liste d'attente" : "S'inscrire"}
          onPress={() => void onReg()}
          loading={r}
          fullWidth
          variant={full ? 'secondary' : 'primary'}
          icon="ticket-outline"
        />
      )}
    </View>
  );
}

export function EventsScreen() {
  const { data, refetch, loading } =
    useQuery<ViewerClubEventsData>(VIEWER_CLUB_EVENTS);
  const events = data?.viewerClubEvents ?? [];

  return (
    <View style={styles.flex}>
      <ScreenHero
        eyebrow="LE CLUB ORGANISE"
        title="Événements"
        subtitle={
          events.length > 0
            ? `${events.length} événement${events.length > 1 ? 's' : ''} à venir`
            : 'Stages, compétitions, soirées du club.'
        }
        gradient="warm"
        overlap
      />
      <FlatList
        style={styles.flex}
        contentContainerStyle={styles.list}
        data={events}
        keyExtractor={(e) => e.id}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refetch()}
            tintColor={palette.primary}
          />
        }
        renderItem={({ item }) => (
          <EventCard event={item} refetch={() => void refetch()} />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: spacing.md }}>
              <Skeleton height={160} borderRadius={radius.xl} />
              <Skeleton height={160} borderRadius={radius.xl} />
            </View>
          ) : (
            <EmptyState
              icon="star-outline"
              title="Aucun événement à venir"
              description="Les stages, compétitions et soirées du club apparaîtront ici."
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
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  dateBlock: {
    width: 56,
    height: 64,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateMonth: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontFamily: typography.smallStrong.fontFamily,
    letterSpacing: 1,
  },
  dateDay: {
    color: '#ffffff',
    fontSize: 24,
    fontFamily: typography.h1.fontFamily,
    letterSpacing: -0.5,
  },
  title: { ...typography.h3, color: palette.ink, marginBottom: spacing.xs },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  meta: { ...typography.small, color: palette.muted },
  body: { ...typography.body, color: palette.body },

  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statText: { ...typography.small, color: palette.body },
  err: { ...typography.small, color: palette.danger },
});
