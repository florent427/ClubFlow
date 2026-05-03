import { useMutation, useQuery } from '@apollo/client/react';
import {
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  Pill,
  ScreenContainer,
  ScreenHero,
  formatDateShort,
  formatEuroCents,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  ACTIVATE_SPONSORSHIP_DEAL,
  CANCEL_SPONSORSHIP_DEAL,
  CLOSE_SPONSORSHIP_DEAL,
  CLUB_SPONSORSHIP_DEAL,
  DELETE_SPONSORSHIP_DEAL,
} from '../../lib/documents/sponsoring';
import type { SponsoringStackParamList } from '../../navigation/types';

type DealStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'CANCELLED';

type Installment = {
  id: string;
  expectedAmountCents: number;
  receivedAmountCents: number | null;
  expectedAt: string | null;
  receivedAt: string | null;
};

type Deal = {
  id: string;
  sponsorName: string;
  kind: 'CASH' | 'IN_KIND';
  status: DealStatus;
  valueCents: number | null;
  amountCents: number | null;
  inKindDescription: string | null;
  projectId: string | null;
  projectTitle: string | null;
  contactId: string | null;
  contactName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  notes: string | null;
  installments: Installment[];
  documents: { id: string; mediaAssetId: string; kind: string }[];
};

type Data = { clubSponsorshipDeal: Deal | null };

type Nav = NativeStackNavigationProp<
  SponsoringStackParamList,
  'SponsorshipDetail'
>;
type Route = RouteProp<SponsoringStackParamList, 'SponsorshipDetail'>;

const STATUS_TONE: Record<
  DealStatus,
  'neutral' | 'success' | 'info' | 'danger'
> = {
  DRAFT: 'neutral',
  ACTIVE: 'success',
  CLOSED: 'info',
  CANCELLED: 'danger',
};

const STATUS_LABEL: Record<DealStatus, string> = {
  DRAFT: 'Brouillon',
  ACTIVE: 'Actif',
  CLOSED: 'Clôturé',
  CANCELLED: 'Annulé',
};

export function SponsorshipDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { dealId } = route.params;

  const { data, loading, refetch } = useQuery<Data>(CLUB_SPONSORSHIP_DEAL, {
    variables: { id: dealId },
    errorPolicy: 'all',
  });

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [activate, { loading: activating }] = useMutation(
    ACTIVATE_SPONSORSHIP_DEAL,
  );
  const [closeDeal, { loading: closing }] = useMutation(
    CLOSE_SPONSORSHIP_DEAL,
  );
  const [cancelDeal, { loading: cancelling }] = useMutation(
    CANCEL_SPONSORSHIP_DEAL,
  );
  const [deleteDeal, { loading: deleting }] = useMutation(
    DELETE_SPONSORSHIP_DEAL,
  );

  const deal = data?.clubSponsorshipDeal ?? null;

  if (loading && !deal) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="SPONSOR"
          title="Chargement…"
          compact
          showBack
        />
      </ScreenContainer>
    );
  }

  if (!deal) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="SPONSOR"
          title="Introuvable"
          compact
          showBack
        />
        <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <EmptyState
            icon="alert-circle-outline"
            title="Convention introuvable"
            description="La convention n'existe plus ou n'est pas accessible."
          />
        </Card>
      </ScreenContainer>
    );
  }

  const value =
    deal.kind === 'IN_KIND'
      ? deal.inKindDescription ?? 'Don en nature'
      : formatEuroCents(deal.valueCents ?? deal.amountCents);

  const onActivate = async () => {
    await activate({ variables: { id: deal.id } });
    await refetch();
  };
  const onClose = async () => {
    await closeDeal({ variables: { id: deal.id } });
    await refetch();
  };
  const onCancel = async () => {
    await cancelDeal({ variables: { id: deal.id } });
    setConfirmCancel(false);
    await refetch();
  };
  const onDelete = async () => {
    await deleteDeal({ variables: { id: deal.id } });
    setConfirmDelete(false);
    navigation.goBack();
  };

  return (
    <ScreenContainer
      padding={0}
      onRefresh={() => void refetch()}
      refreshing={loading}
    >
      <ScreenHero
        eyebrow="SPONSOR"
        title={deal.sponsorName}
        subtitle={value}
        compact
        showBack
      />

      <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
        <View style={styles.pillsRow}>
          <Pill
            label={STATUS_LABEL[deal.status]}
            tone={STATUS_TONE[deal.status]}
          />
          <Pill
            label={deal.kind === 'IN_KIND' ? 'Don nature' : 'Numéraire'}
            tone="primary"
          />
        </View>
        <View style={styles.metaList}>
          {deal.projectTitle ? (
            <MetaRow label="Projet" value={deal.projectTitle} />
          ) : null}
          {deal.contactName ? (
            <MetaRow label="Contact" value={deal.contactName} />
          ) : null}
          {deal.startsAt ? (
            <MetaRow label="Début" value={formatDateShort(deal.startsAt)} />
          ) : null}
          {deal.endsAt ? (
            <MetaRow label="Fin" value={formatDateShort(deal.endsAt)} />
          ) : null}
          {deal.notes ? <MetaRow label="Notes" value={deal.notes} /> : null}
        </View>
      </Card>

      {deal.installments.length > 0 ? (
        <Card
          title="Échéances"
          subtitle={`${deal.installments.length} versement(s)`}
          style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}
        >
          <View style={styles.installmentsList}>
            {deal.installments.map((inst) => {
              const isPaid = inst.receivedAt != null;
              return (
                <View key={inst.id} style={styles.installmentRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.installmentTitle}>
                      {formatEuroCents(inst.expectedAmountCents)}
                    </Text>
                    <Text style={styles.installmentSubtitle}>
                      Prévu :{' '}
                      {inst.expectedAt
                        ? formatDateShort(inst.expectedAt)
                        : '—'}
                    </Text>
                  </View>
                  <Pill
                    label={isPaid ? 'Reçu' : 'En attente'}
                    tone={isPaid ? 'success' : 'warning'}
                  />
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      <Card
        title="Actions"
        style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}
      >
        <View style={styles.actions}>
          {deal.status === 'DRAFT' ? (
            <Button
              label="Activer la convention"
              variant="primary"
              icon="play-circle-outline"
              onPress={() => void onActivate()}
              loading={activating}
            />
          ) : null}
          {deal.status === 'ACTIVE' ? (
            <Button
              label="Clôturer"
              variant="secondary"
              icon="checkmark-done-outline"
              onPress={() => void onClose()}
              loading={closing}
            />
          ) : null}
          {deal.status !== 'CANCELLED' ? (
            <Button
              label="Annuler la convention"
              variant="ghost"
              icon="close-circle-outline"
              onPress={() => setConfirmCancel(true)}
            />
          ) : null}
          <Button
            label="Supprimer définitivement"
            variant="danger"
            icon="trash-outline"
            onPress={() => setConfirmDelete(true)}
          />
        </View>
      </Card>

      <ConfirmSheet
        visible={confirmCancel}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void onCancel()}
        title="Annuler la convention ?"
        message="Cette action passe la convention au statut Annulée."
        confirmLabel="Confirmer"
        loading={cancelling}
      />
      <ConfirmSheet
        visible={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void onDelete()}
        title="Supprimer la convention ?"
        message="Cette action est irréversible. La convention et ses échéances seront supprimées."
        confirmLabel="Supprimer"
        destructive
        loading={deleting}
      />
    </ScreenContainer>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  metaList: {
    gap: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  metaLabel: {
    ...typography.smallStrong,
    color: palette.muted,
  },
  metaValue: {
    ...typography.body,
    color: palette.ink,
    flex: 1,
    textAlign: 'right',
  },
  installmentsList: {
    gap: spacing.sm,
  },
  installmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  installmentTitle: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  installmentSubtitle: {
    ...typography.small,
    color: palette.muted,
    marginTop: 2,
  },
  actions: {
    gap: spacing.sm,
  },
});
