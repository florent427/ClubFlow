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
  ARCHIVE_GRANT,
  CLUB_GRANT_APPLICATION,
  DELETE_GRANT,
  MARK_GRANT_REPORTED,
  REJECT_GRANT,
  SETTLE_GRANT,
  SUBMIT_GRANT,
} from '../../lib/documents/subsidies';
import type { SubsidiesStackParamList } from '../../navigation/types';

type GrantStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'GRANTED'
  | 'REJECTED'
  | 'REPORTED'
  | 'SETTLED'
  | 'ARCHIVED';

type Installment = {
  id: string;
  expectedAmountCents: number;
  receivedAmountCents: number | null;
  expectedAt: string | null;
  receivedAt: string | null;
};

type Grant = {
  id: string;
  title: string;
  fundingBody: string | null;
  status: GrantStatus;
  requestedAmountCents: number | null;
  grantedAmountCents: number | null;
  projectId: string | null;
  projectTitle: string | null;
  startsAt: string | null;
  endsAt: string | null;
  reportDueAt: string | null;
  reportSubmittedAt: string | null;
  notes: string | null;
  installments: Installment[];
  documents: { id: string; mediaAssetId: string; kind: string }[];
};

type Data = { clubGrantApplication: Grant | null };

type Nav = NativeStackNavigationProp<
  SubsidiesStackParamList,
  'SubsidyDetail'
>;
type Route = RouteProp<SubsidiesStackParamList, 'SubsidyDetail'>;

const STATUS_TONE: Record<
  GrantStatus,
  'neutral' | 'warning' | 'success' | 'info' | 'danger'
> = {
  DRAFT: 'neutral',
  SUBMITTED: 'warning',
  GRANTED: 'success',
  REJECTED: 'danger',
  REPORTED: 'info',
  SETTLED: 'success',
  ARCHIVED: 'neutral',
};

const STATUS_LABEL: Record<GrantStatus, string> = {
  DRAFT: 'Brouillon',
  SUBMITTED: 'Soumis',
  GRANTED: 'Accordé',
  REJECTED: 'Rejeté',
  REPORTED: 'Rapporté',
  SETTLED: 'Soldé',
  ARCHIVED: 'Archivé',
};

export function SubsidyDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { grantId } = route.params;

  const { data, loading, refetch } = useQuery<Data>(CLUB_GRANT_APPLICATION, {
    variables: { id: grantId },
    errorPolicy: 'all',
  });

  const [confirmReject, setConfirmReject] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [submitGrant, { loading: submitting }] = useMutation(SUBMIT_GRANT);
  const [rejectGrant, { loading: rejecting }] = useMutation(REJECT_GRANT);
  const [markReported, { loading: marking }] = useMutation(MARK_GRANT_REPORTED);
  const [settleGrant, { loading: settling }] = useMutation(SETTLE_GRANT);
  const [archiveGrant, { loading: archiving }] = useMutation(ARCHIVE_GRANT);
  const [deleteGrant, { loading: deleting }] = useMutation(DELETE_GRANT);

  const grant = data?.clubGrantApplication ?? null;

  if (loading && !grant) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="DOSSIER"
          title="Chargement…"
          compact
          showBack
        />
      </ScreenContainer>
    );
  }

  if (!grant) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="DOSSIER"
          title="Introuvable"
          compact
          showBack
        />
        <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <EmptyState
            icon="alert-circle-outline"
            title="Dossier introuvable"
            description="Le dossier n'existe plus ou n'est pas accessible."
          />
        </Card>
      </ScreenContainer>
    );
  }

  const subtitle =
    grant.grantedAmountCents != null
      ? `Accordé : ${formatEuroCents(grant.grantedAmountCents)}`
      : grant.requestedAmountCents != null
        ? `Demandé : ${formatEuroCents(grant.requestedAmountCents)}`
        : grant.fundingBody ?? '';

  const onSubmit = async () => {
    await submitGrant({ variables: { id: grant.id } });
    await refetch();
  };
  const onReject = async () => {
    await rejectGrant({ variables: { id: grant.id } });
    setConfirmReject(false);
    await refetch();
  };
  const onMarkReported = async () => {
    await markReported({ variables: { id: grant.id } });
    await refetch();
  };
  const onSettle = async () => {
    await settleGrant({ variables: { id: grant.id } });
    await refetch();
  };
  const onArchive = async () => {
    await archiveGrant({ variables: { id: grant.id } });
    await refetch();
  };
  const onDelete = async () => {
    await deleteGrant({ variables: { id: grant.id } });
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
        eyebrow="DOSSIER"
        title={grant.title}
        subtitle={subtitle}
        compact
        showBack
      />

      <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
        <View style={styles.pillsRow}>
          <Pill
            label={STATUS_LABEL[grant.status]}
            tone={STATUS_TONE[grant.status]}
          />
          {grant.fundingBody ? <Pill label={grant.fundingBody} /> : null}
        </View>
        <View style={styles.metaList}>
          {grant.projectTitle ? (
            <MetaRow label="Projet" value={grant.projectTitle} />
          ) : null}
          {grant.requestedAmountCents != null ? (
            <MetaRow
              label="Montant demandé"
              value={formatEuroCents(grant.requestedAmountCents)}
            />
          ) : null}
          {grant.grantedAmountCents != null ? (
            <MetaRow
              label="Montant accordé"
              value={formatEuroCents(grant.grantedAmountCents)}
            />
          ) : null}
          {grant.startsAt ? (
            <MetaRow label="Début" value={formatDateShort(grant.startsAt)} />
          ) : null}
          {grant.endsAt ? (
            <MetaRow label="Fin" value={formatDateShort(grant.endsAt)} />
          ) : null}
          {grant.reportDueAt ? (
            <MetaRow
              label="Rapport dû"
              value={formatDateShort(grant.reportDueAt)}
            />
          ) : null}
          {grant.reportSubmittedAt ? (
            <MetaRow
              label="Rapport rendu"
              value={formatDateShort(grant.reportSubmittedAt)}
            />
          ) : null}
          {grant.notes ? <MetaRow label="Notes" value={grant.notes} /> : null}
        </View>
      </Card>

      {grant.installments.length > 0 ? (
        <Card
          title="Échéances"
          subtitle={`${grant.installments.length} versement(s)`}
          style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}
        >
          <View style={styles.installmentsList}>
            {grant.installments.map((inst) => {
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
          {grant.status === 'DRAFT' ? (
            <Button
              label="Soumettre la demande"
              variant="primary"
              icon="paper-plane-outline"
              onPress={() => void onSubmit()}
              loading={submitting}
            />
          ) : null}
          {grant.status === 'SUBMITTED' ? (
            <Button
              label="Rejeter le dossier"
              variant="ghost"
              icon="close-circle-outline"
              onPress={() => setConfirmReject(true)}
            />
          ) : null}
          {grant.status === 'GRANTED' ? (
            <Button
              label="Marquer comme rapporté"
              variant="primary"
              icon="document-text-outline"
              onPress={() => void onMarkReported()}
              loading={marking}
            />
          ) : null}
          {grant.status === 'REPORTED' ? (
            <Button
              label="Solder le dossier"
              variant="primary"
              icon="checkmark-done-outline"
              onPress={() => void onSettle()}
              loading={settling}
            />
          ) : null}
          {grant.status !== 'ARCHIVED' && grant.status !== 'DRAFT' ? (
            <Button
              label="Archiver"
              variant="ghost"
              icon="archive-outline"
              onPress={() => void onArchive()}
              loading={archiving}
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
        visible={confirmReject}
        onCancel={() => setConfirmReject(false)}
        onConfirm={() => void onReject()}
        title="Rejeter ce dossier ?"
        message="Le dossier passera au statut Rejeté."
        confirmLabel="Rejeter"
        loading={rejecting}
      />
      <ConfirmSheet
        visible={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void onDelete()}
        title="Supprimer le dossier ?"
        message="Cette action est irréversible."
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
      <Text style={styles.metaValue} numberOfLines={4}>
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
