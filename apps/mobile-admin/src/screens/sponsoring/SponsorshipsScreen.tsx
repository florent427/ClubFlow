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
import { CLUB_SPONSORSHIP_DEALS } from '../../lib/documents/sponsoring';
import type { SponsoringStackParamList } from '../../navigation/types';

type DealStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'CANCELLED';

type Deal = {
  id: string;
  sponsorName: string;
  kind: 'CASH' | 'IN_KIND';
  status: DealStatus;
  valueCents: number | null;
  amountCents: number | null;
  inKindDescription: string | null;
  projectTitle: string | null;
  contactName: string | null;
  startsAt: string | null;
  endsAt: string | null;
};

type Data = { clubSponsorshipDeals: Deal[] };

type Nav = NativeStackNavigationProp<
  SponsoringStackParamList,
  'Sponsorships'
>;

const STATUS_CHIPS: FilterChip[] = [
  { key: 'DRAFT', label: 'Brouillon' },
  { key: 'ACTIVE', label: 'Actif' },
  { key: 'CLOSED', label: 'Clôturé' },
  { key: 'CANCELLED', label: 'Annulé' },
];

const STATUS_BADGE: Record<
  DealStatus,
  { label: string; color: string; bg: string }
> = {
  DRAFT: { label: 'Brouillon', color: palette.muted, bg: palette.bgAlt },
  ACTIVE: {
    label: 'Actif',
    color: palette.successText,
    bg: palette.successBg,
  },
  CLOSED: { label: 'Clôturé', color: palette.infoText, bg: palette.infoBg },
  CANCELLED: {
    label: 'Annulé',
    color: palette.dangerText,
    bg: palette.dangerBg,
  },
};

export function SponsorshipsScreen() {
  const navigation = useNavigation<Nav>();
  const [status, setStatus] = useState<string | null>(null);

  const { data, loading, refetch } = useQuery<Data>(CLUB_SPONSORSHIP_DEALS, {
    variables: status ? { status } : {},
    errorPolicy: 'all',
  });

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.clubSponsorshipDeals ?? [];
    return list.map((deal) => {
      const value =
        deal.kind === 'IN_KIND'
          ? deal.inKindDescription ?? 'Don nature'
          : formatEuroCents(deal.valueCents ?? deal.amountCents);
      return {
        key: deal.id,
        title: deal.sponsorName,
        subtitle: [deal.projectTitle, value].filter(Boolean).join(' · '),
        badge: STATUS_BADGE[deal.status] ?? null,
      };
    });
  }, [data]);

  return (
    <ScreenContainer scroll={false} padding={0}>
      <ScreenHero
        eyebrow="PARTENARIATS"
        title="Sponsoring"
        subtitle={`${data?.clubSponsorshipDeals?.length ?? 0} convention(s)`}
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
        emptyTitle="Aucun sponsor"
        emptySubtitle="Aucune convention de sponsoring pour ce filtre."
        emptyIcon="ribbon-outline"
        onPressRow={(id) =>
          navigation.navigate('SponsorshipDetail', { dealId: id })
        }
      />
    </ScreenContainer>
  );
}
