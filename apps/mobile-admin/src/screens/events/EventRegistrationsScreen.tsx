import { useMutation, useQuery } from '@apollo/client/react';
import {
  BottomActionBar,
  ConfirmSheet,
  DataTable,
  ScreenContainer,
  ScreenHero,
  formatDateTime,
  palette,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import {
  ADMIN_CANCEL_EVENT_REGISTRATION,
  CLUB_EVENT_REGISTRATIONS,
} from '../../lib/documents/events';
import type { EventsStackParamList } from '../../navigation/types';

type RegistrationStatus =
  | 'REGISTERED'
  | 'WAITLISTED'
  | 'CANCELLED'
  | string;

type Registration = {
  id: string;
  eventId: string;
  memberId: string | null;
  contactId: string | null;
  status: RegistrationStatus;
  registeredAt: string;
  cancelledAt: string | null;
  note: string | null;
  displayName: string | null;
};

type EventNode = {
  id: string;
  title: string;
  startsAt: string;
  registrations: Registration[];
};

type Data = { clubEvents: EventNode[] };

type Rt = RouteProp<EventsStackParamList, 'EventRegistrations'>;

const STATUS_BADGE: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  REGISTERED: {
    label: 'Inscrit',
    color: palette.successText,
    bg: palette.successBg,
  },
  WAITLISTED: {
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

export function EventRegistrationsScreen() {
  const route = useRoute<Rt>();
  const eventId = route.params.eventId;

  const { data, loading, refetch } = useQuery<Data>(CLUB_EVENT_REGISTRATIONS, {
    errorPolicy: 'all',
  });

  const [actionTargetId, setActionTargetId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const [cancelRegistration, { loading: cancelling }] = useMutation(
    ADMIN_CANCEL_EVENT_REGISTRATION,
    { refetchQueries: [{ query: CLUB_EVENT_REGISTRATIONS }] },
  );

  const event = useMemo(
    () => data?.clubEvents?.find((e) => e.id === eventId) ?? null,
    [data, eventId],
  );

  const rows = useMemo<DataTableRow[]>(() => {
    const list = event?.registrations ?? [];
    const sorted = [...list].sort(
      (a, b) =>
        new Date(b.registeredAt).getTime() -
        new Date(a.registeredAt).getTime(),
    );
    return sorted.map((r) => ({
      key: r.id,
      title:
        r.displayName ??
        (r.memberId ? `Membre #${r.memberId.slice(0, 6)}` : 'Invité'),
      subtitle: `Inscrit ${formatDateTime(r.registeredAt)}`,
      badge: STATUS_BADGE[r.status] ?? null,
    }));
  }, [event]);

  const targetRegistration = useMemo(
    () => event?.registrations?.find((r) => r.id === actionTargetId) ?? null,
    [event, actionTargetId],
  );

  const handleConfirmCancel = async () => {
    if (!confirmCancelId) return;
    try {
      await cancelRegistration({
        variables: { registrationId: confirmCancelId },
      });
      setConfirmCancelId(null);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Annulation impossible.');
    }
  };

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="INSCRIPTIONS"
        title={event?.title ?? 'Inscriptions'}
        subtitle={
          event
            ? `${event.registrations.length} inscription${event.registrations.length > 1 ? 's' : ''}`
            : undefined
        }
        showBack
        compact
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={() => void refetch()}
        refreshing={loading}
        emptyTitle="Aucune inscription"
        emptySubtitle="Les inscriptions s'afficheront ici dès qu'un membre s'inscrit."
        emptyIcon="people-outline"
        onLongPressRow={(id) => {
          const reg = event?.registrations?.find((r) => r.id === id);
          if (reg && reg.status !== 'CANCELLED') setActionTargetId(id);
        }}
      />

      <BottomActionBar
        visible={
          actionTargetId != null && targetRegistration?.status !== 'CANCELLED'
        }
        onClose={() => setActionTargetId(null)}
        title={targetRegistration?.displayName ?? 'Inscription'}
        actions={[
          {
            key: 'cancel',
            label: 'Annuler l\'inscription',
            icon: 'close-circle-outline',
            tone: 'danger',
            disabled: cancelling,
          },
        ]}
        onAction={(key) => {
          const id = actionTargetId;
          setActionTargetId(null);
          if (!id) return;
          if (key === 'cancel') setConfirmCancelId(id);
        }}
      />

      <ConfirmSheet
        visible={confirmCancelId != null}
        onCancel={() => setConfirmCancelId(null)}
        onConfirm={handleConfirmCancel}
        title="Annuler cette inscription ?"
        message="Le membre sera retiré de la liste des participants."
        confirmLabel="Annuler l'inscription"
        destructive
        loading={cancelling}
      />
    </ScreenContainer>
  );
}
