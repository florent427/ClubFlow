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
import { StyleSheet, Text, View } from 'react-native';
import {
  CANCEL_ACCOUNTING_ENTRY,
  CLUB_ACCOUNTING_ENTRY,
  CONSOLIDATE_ACCOUNTING_ENTRY,
  DELETE_ACCOUNTING_ENTRY_PERMANENT,
  UNCONSOLIDATE_ACCOUNTING_ENTRY,
} from '../../lib/documents/accounting';
import type { AccountingStackParamList } from '../../navigation/types';

type EntryStatus =
  | 'DRAFT'
  | 'NEEDS_REVIEW'
  | 'POSTED'
  | 'LOCKED'
  | 'CANCELLED';

type EntryLine = {
  id: string;
  accountCode: string;
  label: string | null;
  debitCents: number;
  creditCents: number;
};

type EntryDocument = {
  id: string;
  mediaAssetId: string;
  kind: string;
};

type Entry = {
  id: string;
  kind: 'INCOME' | 'EXPENSE' | 'IN_KIND';
  status: EntryStatus;
  source: string;
  label: string;
  amountCents: number;
  vatTotalCents: number | null;
  occurredAt: string;
  consolidatedAt: string | null;
  createdAt: string;
  lines: EntryLine[];
  documents: EntryDocument[];
};

type Data = { clubAccountingEntry: Entry | null };

type Nav = NativeStackNavigationProp<AccountingStackParamList, 'EntryDetail'>;
type Route = RouteProp<AccountingStackParamList, 'EntryDetail'>;

const STATUS_TONE: Record<
  EntryStatus,
  'neutral' | 'warning' | 'success' | 'info' | 'danger'
> = {
  DRAFT: 'neutral',
  NEEDS_REVIEW: 'warning',
  POSTED: 'success',
  LOCKED: 'info',
  CANCELLED: 'danger',
};

const STATUS_LABEL: Record<EntryStatus, string> = {
  DRAFT: 'Brouillon',
  NEEDS_REVIEW: 'À valider',
  POSTED: 'Validée',
  LOCKED: 'Verrouillée',
  CANCELLED: 'Annulée',
};

const KIND_LABEL: Record<'INCOME' | 'EXPENSE' | 'IN_KIND', string> = {
  INCOME: 'Recette',
  EXPENSE: 'Dépense',
  IN_KIND: 'Don nature',
};

export function EntryDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { entryId } = route.params;

  const { data, loading, refetch } = useQuery<Data>(CLUB_ACCOUNTING_ENTRY, {
    variables: { id: entryId },
    errorPolicy: 'all',
  });

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [consolidate, { loading: consolidating }] = useMutation(
    CONSOLIDATE_ACCOUNTING_ENTRY,
  );
  const [unconsolidate, { loading: unconsolidating }] = useMutation(
    UNCONSOLIDATE_ACCOUNTING_ENTRY,
  );
  const [cancelEntry, { loading: cancelling }] = useMutation(
    CANCEL_ACCOUNTING_ENTRY,
  );
  const [deleteEntry, { loading: deleting }] = useMutation(
    DELETE_ACCOUNTING_ENTRY_PERMANENT,
  );

  const entry = data?.clubAccountingEntry ?? null;

  if (loading && !entry) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="ÉCRITURE"
          title="Chargement…"
          compact
          showBack
        />
      </ScreenContainer>
    );
  }

  if (!entry) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="ÉCRITURE"
          title="Introuvable"
          compact
          showBack
        />
        <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <EmptyState
            icon="alert-circle-outline"
            title="Écriture introuvable"
            description="L'écriture n'existe plus ou n'est pas accessible."
          />
        </Card>
      </ScreenContainer>
    );
  }

  const isConsolidated = entry.consolidatedAt != null;
  const sign =
    entry.kind === 'INCOME' ? '+' : entry.kind === 'EXPENSE' ? '−' : '';

  const onConsolidate = async () => {
    await consolidate({ variables: { entryId: entry.id } });
    await refetch();
  };
  const onUnconsolidate = async () => {
    await unconsolidate({ variables: { entryId: entry.id } });
    await refetch();
  };
  const onCancel = async () => {
    await cancelEntry({
      variables: { input: { id: entry.id, reason: 'Annulé via mobile' } },
    });
    setConfirmCancel(false);
    await refetch();
  };
  const onDelete = async () => {
    await deleteEntry({ variables: { id: entry.id } });
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
        eyebrow="ÉCRITURE"
        title={entry.label}
        subtitle={`${sign}${formatEuroCents(entry.amountCents)}`}
        compact
        showBack
      />

      <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
        <View style={styles.pillsRow}>
          <Pill
            label={STATUS_LABEL[entry.status]}
            tone={STATUS_TONE[entry.status]}
          />
          <Pill label={KIND_LABEL[entry.kind]} tone="primary" />
          <Pill label={entry.source} />
          {isConsolidated ? <Pill label="Consolidée" tone="info" /> : null}
        </View>
        <View style={styles.metaList}>
          <MetaRow label="Date" value={formatDateTime(entry.occurredAt)} />
          <MetaRow label="Créée le" value={formatDateTime(entry.createdAt)} />
          {entry.vatTotalCents != null ? (
            <MetaRow
              label="TVA"
              value={formatEuroCents(entry.vatTotalCents)}
            />
          ) : null}
          {entry.documents.length > 0 ? (
            <MetaRow
              label="Documents"
              value={`${entry.documents.length} fichier(s)`}
            />
          ) : null}
        </View>
      </Card>

      <Card
        title="Lignes"
        subtitle={`${entry.lines.length} ligne(s)`}
        style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}
      >
        {entry.lines.length === 0 ? (
          <EmptyState
            icon="document-outline"
            title="Aucune ligne"
            description="Cette écriture n'a pas encore de ligne."
          />
        ) : (
          <View style={styles.linesList}>
            {entry.lines.map((line) => (
              <View key={line.id} style={styles.lineRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineCode} numberOfLines={1}>
                    {line.accountCode}
                  </Text>
                  {line.label ? (
                    <Text style={styles.lineLabel} numberOfLines={2}>
                      {line.label}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.lineAmounts}>
                  {line.debitCents > 0 ? (
                    <Text style={styles.debit}>
                      D {formatEuroCents(line.debitCents)}
                    </Text>
                  ) : null}
                  {line.creditCents > 0 ? (
                    <Text style={styles.credit}>
                      C {formatEuroCents(line.creditCents)}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card
        title="Actions"
        style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}
      >
        <View style={styles.actions}>
          {isConsolidated ? (
            <Button
              label="Défaire consolidation"
              variant="ghost"
              icon="git-network-outline"
              onPress={() => void onUnconsolidate()}
              loading={unconsolidating}
            />
          ) : (
            <Button
              label="Consolider"
              variant="primary"
              icon="git-merge-outline"
              onPress={() => void onConsolidate()}
              loading={consolidating}
            />
          )}
          <Button
            label="Annuler l'écriture"
            variant="ghost"
            icon="close-circle-outline"
            onPress={() => setConfirmCancel(true)}
            disabled={entry.status === 'CANCELLED'}
          />
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
        title="Annuler l'écriture ?"
        message="Cette action passe l'écriture au statut Annulée. Vous pourrez la consulter mais elle n'impactera plus le solde."
        confirmLabel="Annuler l'écriture"
        loading={cancelling}
      />
      <ConfirmSheet
        visible={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void onDelete()}
        title="Supprimer définitivement ?"
        message="Cette action est irréversible. L'écriture et toutes ses lignes seront supprimées."
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
      <Text style={styles.metaValue} numberOfLines={2}>
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
  linesList: { gap: spacing.sm },
  lineRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
    gap: spacing.md,
  },
  lineCode: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  lineLabel: {
    ...typography.small,
    color: palette.muted,
  },
  lineAmounts: {
    alignItems: 'flex-end',
    gap: 2,
  },
  debit: {
    ...typography.smallStrong,
    color: palette.dangerText,
  },
  credit: {
    ...typography.smallStrong,
    color: palette.successText,
  },
  actions: {
    gap: spacing.sm,
  },
});
