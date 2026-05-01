import { useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  DataTable,
  FilterChipBar,
  KpiTile,
  ScreenContainer,
  ScreenHero,
  formatDateShort,
  formatEuroCents,
  palette,
  spacing,
  type DataTableRow,
  type FilterChip,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  CLUB_ACCOUNTING_ENTRIES,
  CLUB_ACCOUNTING_SUMMARY,
} from '../../lib/documents/accounting';
import type { AccountingStackParamList } from '../../navigation/types';

type EntryStatus =
  | 'DRAFT'
  | 'NEEDS_REVIEW'
  | 'POSTED'
  | 'LOCKED'
  | 'CANCELLED';

type EntryRow = {
  id: string;
  kind: 'INCOME' | 'EXPENSE' | 'IN_KIND';
  status: EntryStatus;
  source: string;
  label: string;
  amountCents: number;
  occurredAt: string;
  consolidatedAt: string | null;
  /** Présent = pipeline IA OCR en cours. Affiche un badge spécial. */
  aiProcessingStartedAt: string | null;
};

type EntriesData = { clubAccountingEntries: EntryRow[] };

type SummaryData = {
  clubAccountingSummary: {
    incomeCents: number;
    expenseCents: number;
    balanceCents: number;
  } | null;
};

type Nav = NativeStackNavigationProp<
  AccountingStackParamList,
  'AccountingHome'
>;

const STATUS_CHIPS: FilterChip[] = [
  { key: 'DRAFT', label: 'Brouillon' },
  { key: 'NEEDS_REVIEW', label: 'À valider' },
  { key: 'POSTED', label: 'Validée' },
  { key: 'LOCKED', label: 'Verrouillée' },
  { key: 'CANCELLED', label: 'Annulée' },
];

const STATUS_BADGE: Record<
  EntryStatus,
  { label: string; color: string; bg: string }
> = {
  DRAFT: { label: 'Brouillon', color: palette.muted, bg: palette.bgAlt },
  NEEDS_REVIEW: {
    label: 'À valider',
    color: palette.warningText,
    bg: palette.warningBg,
  },
  POSTED: {
    label: 'Validée',
    color: palette.successText,
    bg: palette.successBg,
  },
  LOCKED: { label: 'Verrouillée', color: palette.infoText, bg: palette.infoBg },
  CANCELLED: {
    label: 'Annulée',
    color: palette.dangerText,
    bg: palette.dangerBg,
  },
};

function startOfMonthIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function endOfMonthIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
}

export function AccountingHomeScreen() {
  const navigation = useNavigation<Nav>();
  const [status, setStatus] = useState<string | null>(null);

  const { data, loading, refetch, startPolling, stopPolling } =
    useQuery<EntriesData>(CLUB_ACCOUNTING_ENTRIES, {
      variables: status ? { status } : {},
      errorPolicy: 'all',
    });

  /**
   * Si au moins une écriture est en cours d'analyse OCR, on lance un
   * polling de 4s pour rafraîchir la liste sans intervention de
   * l'utilisateur. Dès qu'aucune n'est plus en cours, on arrête le
   * polling pour économiser les ressources.
   */
  const anyProcessing = useMemo(
    () =>
      (data?.clubAccountingEntries ?? []).some(
        (e) => e.aiProcessingStartedAt != null,
      ),
    [data],
  );
  useEffect(() => {
    if (anyProcessing) {
      startPolling(4000);
      return () => stopPolling();
    }
    stopPolling();
    return undefined;
  }, [anyProcessing, startPolling, stopPolling]);

  const { data: summaryData, refetch: refetchSummary } = useQuery<SummaryData>(
    CLUB_ACCOUNTING_SUMMARY,
    {
      variables: { from: startOfMonthIso(), to: endOfMonthIso() },
      errorPolicy: 'all',
    },
  );

  const summary = summaryData?.clubAccountingSummary;

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.clubAccountingEntries ?? [];
    return list.map((entry) => {
      const sign =
        entry.kind === 'INCOME' ? '+' : entry.kind === 'EXPENSE' ? '−' : '';
      const processing = entry.aiProcessingStartedAt != null;
      // Si pipeline IA en cours : badge spécial "Analyse en cours" qui
      // remplace le badge de statut, et label préfixé d'un loader emoji
      // pour que l'utilisateur identifie la ligne dans le scan rapide.
      return {
        key: entry.id,
        title: processing ? `⏳ ${entry.label}` : entry.label,
        subtitle: processing
          ? `${formatDateShort(entry.occurredAt)} · IA en cours…`
          : `${formatDateShort(entry.occurredAt)} · ${sign}${formatEuroCents(entry.amountCents)}`,
        badge: processing
          ? {
              label: 'Analyse IA',
              color: palette.primary,
              bg: palette.bgAlt,
            }
          : (STATUS_BADGE[entry.status] ?? null),
      };
    });
  }, [data]);

  const onRefresh = () => {
    void refetch();
    void refetchSummary();
  };

  return (
    <ScreenContainer scroll={false} padding={0}>
      <ScreenHero
        eyebrow="COMPTABILITÉ"
        title="Registre"
        subtitle="Suivi des écritures du mois"
        compact
      />
      <View style={styles.kpisRow}>
        <KpiTile
          icon="trending-up-outline"
          label="Recettes"
          value={summary ? formatEuroCents(summary.incomeCents) : '—'}
          tone="success"
          compact
        />
        <KpiTile
          icon="trending-down-outline"
          label="Dépenses"
          value={summary ? formatEuroCents(summary.expenseCents) : '—'}
          tone="warm"
          compact
        />
        <KpiTile
          icon="wallet-outline"
          label="Solde"
          value={summary ? formatEuroCents(summary.balanceCents) : '—'}
          tone="primary"
          compact
        />
      </View>
      <FilterChipBar
        chips={STATUS_CHIPS}
        activeKey={status}
        onSelect={setStatus}
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={onRefresh}
        refreshing={loading}
        emptyTitle="Aucune écriture"
        emptySubtitle="Aucune écriture ne correspond à ce filtre."
        emptyIcon="document-text-outline"
        onPressRow={(id) =>
          navigation.navigate('EntryDetail', { entryId: id })
        }
      />
      <Pressable
        onPress={() => navigation.navigate('NewEntry', {})}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Nouvelle écriture"
      >
        <Ionicons name="add" size={28} color={palette.surface} />
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  kpisRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
