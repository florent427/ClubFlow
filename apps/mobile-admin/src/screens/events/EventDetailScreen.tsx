import { useMutation, useQuery } from '@apollo/client/react';
import {
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  Pill,
  ScreenContainer,
  ScreenHero,
  formatDateTime,
  formatEuroCents,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  CANCEL_CLUB_EVENT,
  CLUB_EVENTS,
  DELETE_CLUB_EVENT,
  PUBLISH_CLUB_EVENT,
} from '../../lib/documents/events';
import type { EventsStackParamList } from '../../navigation/types';

type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED';

type Event = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
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

type Nav = NativeStackNavigationProp<EventsStackParamList, 'EventDetail'>;
type Rt = RouteProp<EventsStackParamList, 'EventDetail'>;

const STATUS_LABEL: Record<EventStatus, string> = {
  DRAFT: 'Brouillon',
  PUBLISHED: 'Publié',
  CANCELLED: 'Annulé',
};

const STATUS_TONE: Record<EventStatus, 'warning' | 'success' | 'danger'> = {
  DRAFT: 'warning',
  PUBLISHED: 'success',
  CANCELLED: 'danger',
};

export function EventDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const eventId = route.params.eventId;

  const { data, loading, refetch } = useQuery<Data>(CLUB_EVENTS, {
    errorPolicy: 'all',
  });

  const event = data?.clubEvents?.find((e) => e.id === eventId);

  const [publishOpen, setPublishOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [publishEvent, publishState] = useMutation(PUBLISH_CLUB_EVENT, {
    refetchQueries: [{ query: CLUB_EVENTS }],
  });
  const [cancelEvent, cancelState] = useMutation(CANCEL_CLUB_EVENT, {
    refetchQueries: [{ query: CLUB_EVENTS }],
  });
  const [deleteEvent, deleteState] = useMutation(DELETE_CLUB_EVENT, {
    refetchQueries: [{ query: CLUB_EVENTS }],
  });

  const handlePublish = () => {
    void publishEvent({ variables: { id: eventId } })
      .then(() => setPublishOpen(false))
      .catch(() => setPublishOpen(false));
  };

  const handleCancel = () => {
    void cancelEvent({ variables: { id: eventId } })
      .then(() => setCancelOpen(false))
      .catch(() => setCancelOpen(false));
  };

  const handleDelete = () => {
    void deleteEvent({ variables: { id: eventId } })
      .then(() => {
        setDeleteOpen(false);
        navigation.goBack();
      })
      .catch(() => setDeleteOpen(false));
  };

  if (loading && !data) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero eyebrow="ÉVÉNEMENT" title="Chargement…" showBack compact />
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={palette.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!event) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero eyebrow="ÉVÉNEMENT" title="Introuvable" showBack compact />
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="alert-circle-outline"
            title="Événement introuvable"
            description="Cet événement a peut-être été supprimé."
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      padding={0}
      onRefresh={() => void refetch()}
      refreshing={loading}
    >
      <ScreenHero
        eyebrow="ÉVÉNEMENT"
        title={event.title}
        subtitle={formatDateTime(event.startsAt)}
        showBack
      />

      <View style={styles.content}>
        {/* Statut */}
        <View style={styles.statusRow}>
          <Pill
            label={STATUS_LABEL[event.status]}
            tone={STATUS_TONE[event.status]}
          />
          {event.publishedAt ? (
            <Pill
              label={`Publié ${formatDateTime(event.publishedAt)}`}
              tone="info"
              icon="checkmark-circle-outline"
            />
          ) : null}
        </View>

        {/* Quand & où */}
        <Card title="Quand & où">
          <InfoLine label="Début" value={formatDateTime(event.startsAt)} />
          <InfoLine label="Fin" value={formatDateTime(event.endsAt)} />
          {event.location ? (
            <InfoLine label="Lieu" value={event.location} />
          ) : null}
        </Card>

        {/* Inscriptions */}
        <Card title="Inscriptions">
          <InfoLine
            label="Inscrits"
            value={
              event.capacity != null
                ? `${event.registeredCount} / ${event.capacity}`
                : String(event.registeredCount)
            }
          />
          {event.waitlistCount > 0 ? (
            <InfoLine
              label="Liste d'attente"
              value={String(event.waitlistCount)}
            />
          ) : null}
          {event.priceCents != null ? (
            <InfoLine label="Tarif" value={formatEuroCents(event.priceCents)} />
          ) : null}
        </Card>

        {/* Description */}
        {event.description ? (
          <Card title="Description">
            <Text style={styles.description}>{event.description}</Text>
          </Card>
        ) : null}

        {/* Actions */}
        <Card title="Actions">
          <View style={styles.actions}>
            {event.status === 'DRAFT' ? (
              <Button
                label="Publier l'événement"
                icon="send-outline"
                variant="primary"
                onPress={() => setPublishOpen(true)}
                fullWidth
              />
            ) : null}
            {event.status === 'PUBLISHED' ? (
              <Button
                label="Annuler l'événement"
                icon="close-circle-outline"
                variant="secondary"
                onPress={() => setCancelOpen(true)}
                fullWidth
              />
            ) : null}
            <Button
              label="Supprimer définitivement"
              icon="trash-outline"
              variant="danger"
              onPress={() => setDeleteOpen(true)}
              fullWidth
            />
          </View>
        </Card>
      </View>

      <ConfirmSheet
        visible={publishOpen}
        onCancel={() => setPublishOpen(false)}
        onConfirm={handlePublish}
        title="Publier l'événement ?"
        message="Les membres pourront s'inscrire dès maintenant."
        confirmLabel="Publier"
        loading={publishState.loading}
      />
      <ConfirmSheet
        visible={cancelOpen}
        onCancel={() => setCancelOpen(false)}
        onConfirm={handleCancel}
        title="Annuler l'événement ?"
        message="Les inscriptions seront fermées et les inscrits notifiés."
        confirmLabel="Annuler l'événement"
        destructive
        loading={cancelState.loading}
      />
      <ConfirmSheet
        visible={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Supprimer cet événement ?"
        message="Toutes les données associées seront définitivement perdues."
        confirmLabel="Supprimer"
        destructive
        loading={deleteState.loading}
      />
    </ScreenContainer>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loaderWrap: { paddingVertical: spacing.huge, alignItems: 'center' },
  emptyWrap: { paddingVertical: spacing.huge, paddingHorizontal: spacing.lg },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  lineLabel: { ...typography.small, color: palette.muted },
  lineValue: {
    ...typography.bodyStrong,
    color: palette.ink,
    flexShrink: 1,
    textAlign: 'right',
  },
  description: {
    ...typography.body,
    color: palette.body,
    lineHeight: 22,
  },
  actions: { gap: spacing.sm },
});
