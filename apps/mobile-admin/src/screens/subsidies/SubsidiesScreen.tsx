import { useQuery } from '@apollo/client/react';
import {
  DataTable,
  FilterChipBar,
  ScreenContainer,
  ScreenHero,
  formatEuroCents,
  palette,
  type DataTableRow,
  type FilterChip,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { CLUB_GRANT_APPLICATIONS } from '../../lib/documents/subsidies';
import type { SubsidiesStackParamList } from '../../navigation/types';

type GrantStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'GRANTED'
  | 'REJECTED'
  | 'REPORTED'
  | 'SETTLED'
  | 'ARCHIVED';

type Grant = {
  id: string;
  title: string;
  fundingBody: string | null;
  status: GrantStatus;
  requestedAmountCents: number | null;
  grantedAmountCents: number | null;
  projectTitle: string | null;
  startsAt: string | null;
  endsAt: string | null;
  reportDueAt: string | null;
};

type Data = { clubGrantApplications: Grant[] };

type Nav = NativeStackNavigationProp<SubsidiesStackParamList, 'Subsidies'>;

const STATUS_CHIPS: FilterChip[] = [
  { key: 'DRAFT', label: 'Brouillon' },
  { key: 'SUBMITTED', label: 'Soumis' },
  { key: 'GRANTED', label: 'Accordé' },
  { key: 'REJECTED', label: 'Rejeté' },
  { key: 'REPORTED', label: 'Rapporté' },
  { key: 'SETTLED', label: 'Soldé' },
  { key: 'ARCHIVED', label: 'Archivé' },
];

const STATUS_BADGE: Record<
  GrantStatus,
  { label: string; color: string; bg: string }
> = {
  DRAFT: { label: 'Brouillon', color: palette.muted, bg: palette.bgAlt },
  SUBMITTED: {
    label: 'Soumis',
    color: palette.warningText,
    bg: palette.warningBg,
  },
  GRANTED: {
    label: 'Accordé',
    color: palette.successText,
    bg: palette.successBg,
  },
  REJECTED: {
    label: 'Rejeté',
    color: palette.dangerText,
    bg: palette.dangerBg,
  },
  REPORTED: { label: 'Rapporté', color: palette.infoText, bg: palette.infoBg },
  SETTLED: {
    label: 'Soldé',
    color: palette.successText,
    bg: palette.successBg,
  },
  ARCHIVED: { label: 'Archivé', color: palette.muted, bg: palette.bgAlt },
};

export function SubsidiesScreen() {
  const navigation = useNavigation<Nav>();
  const [status, setStatus] = useState<string | null>(null);

  const { data, loading, refetch } = useQuery<Data>(CLUB_GRANT_APPLICATIONS, {
    variables: status ? { status } : {},
    errorPolicy: 'all',
  });

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.clubGrantApplications ?? [];
    return list.map((grant) => {
      const amount =
        grant.grantedAmountCents != null
          ? `Accordé : ${formatEuroCents(grant.grantedAmountCents)}`
          : grant.requestedAmountCents != null
            ? `Demandé : ${formatEuroCents(grant.requestedAmountCents)}`
            : null;
      return {
        key: grant.id,
        title: grant.title,
        subtitle: [grant.fundingBody, amount].filter(Boolean).join(' · '),
        badge: STATUS_BADGE[grant.status] ?? null,
      };
    });
  }, [data]);

  return (
    <ScreenContainer scroll={false} padding={0}>
      <ScreenHero
        eyebrow="SUBVENTIONS"
        title="Dossiers"
        subtitle={`${data?.clubGrantApplications?.length ?? 0} dossier(s)`}
        compact
      />
      <FilterChipBar
        chips={STATUS_CHIPS}
        activeKey={status}
        onSelect={setStatus}
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Aucun dossier"
        emptySubtitle="Aucune subvention ne correspond à ce filtre."
        emptyIcon="folder-open-outline"
        onPressRow={(id) =>
          navigation.navigate('SubsidyDetail', { grantId: id })
        }
      />
    </ScreenContainer>
  );
}
