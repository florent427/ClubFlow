import { useQuery } from '@apollo/client/react';
import {
  DataTable,
  ScreenContainer,
  ScreenHero,
  formatDateShort,
  formatEuroCents,
  palette,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { CLUB_ACCOUNTING_REVIEW_QUEUE } from '../../lib/documents/accounting';
import type { AccountingStackParamList } from '../../navigation/types';

type ReviewEntry = {
  id: string;
  kind: 'INCOME' | 'EXPENSE' | 'IN_KIND';
  status: string;
  source: string;
  label: string;
  amountCents: number;
  occurredAt: string;
};

type Data = { clubAccountingReviewQueue: ReviewEntry[] };

type Nav = NativeStackNavigationProp<AccountingStackParamList, 'ReviewQueue'>;

export function AccountingReviewQueueScreen() {
  const navigation = useNavigation<Nav>();
  const { data, loading, refetch } = useQuery<Data>(CLUB_ACCOUNTING_REVIEW_QUEUE, {
    errorPolicy: 'all',
  });

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.clubAccountingReviewQueue ?? [];
    return list.map((entry) => {
      const sign = entry.kind === 'INCOME' ? '+' : entry.kind === 'EXPENSE' ? '−' : '';
      return {
        key: entry.id,
        title: entry.label,
        subtitle: `${formatDateShort(entry.occurredAt)} · ${sign}${formatEuroCents(entry.amountCents)}`,
        badge: {
          label: 'À valider',
          color: palette.warningText,
          bg: palette.warningBg,
        },
      };
    });
  }, [data]);

  return (
    <ScreenContainer scroll={false} padding={0}>
      <ScreenHero
        eyebrow="À VALIDER"
        title="File de revue"
        subtitle={`${data?.clubAccountingReviewQueue?.length ?? 0} écriture(s) en attente`}
        compact
        showBack
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Rien à valider"
        emptySubtitle="Toutes les écritures sont à jour."
        emptyIcon="checkmark-done-outline"
        onPressRow={(id) =>
          navigation.navigate('EntryDetail', { entryId: id })
        }
      />
    </ScreenContainer>
  );
}
