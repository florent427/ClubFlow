import { useQuery } from '@apollo/client/react';
import {
  DataTable,
  EmptyState,
  ScreenContainer,
  ScreenHero,
  formatDateTime,
  formatEuroCents,
  palette,
  spacing,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { CLUB_MEMBERSHIP_CARTS } from '../../lib/documents/memberships';
import type { MembersStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MembersStackParamList, 'MembershipCarts'>;

type CartItem = {
  id: string;
  memberFullName: string;
  membershipProductLabel: string | null;
  lineTotalCents: number;
};

type Cart = {
  id: string;
  familyId: string;
  payerFullName: string | null;
  status: 'OPEN' | 'VALIDATED' | 'CANCELLED' | string;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
  items: CartItem[];
};

type Data = { clubMembershipCarts: Cart[] };

const STATUS_BADGE: Record<
  'OPEN' | 'VALIDATED' | 'CANCELLED',
  { label: string; color: string; bg: string }
> = {
  OPEN: {
    label: 'En cours',
    color: palette.warningText,
    bg: palette.warningBg,
  },
  VALIDATED: {
    label: 'Validé',
    color: palette.successText,
    bg: palette.successBg,
  },
  CANCELLED: {
    label: 'Annulé',
    color: palette.muted,
    bg: palette.bgAlt,
  },
};

export function MembershipCartsScreen() {
  const navigation = useNavigation<Nav>();
  const { data, loading, error, refetch } = useQuery<Data>(
    CLUB_MEMBERSHIP_CARTS,
    {
      errorPolicy: 'all',
    },
  );

  const carts = data?.clubMembershipCarts ?? null;

  const rows = useMemo<DataTableRow[]>(() => {
    if (!carts) return [];
    const sorted = [...carts].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return sorted.map((c) => {
      const status =
        c.status === 'OPEN' ||
        c.status === 'VALIDATED' ||
        c.status === 'CANCELLED'
          ? c.status
          : 'OPEN';
      return {
        key: c.id,
        title: c.payerFullName ?? `Foyer #${c.familyId.slice(0, 8)}`,
        subtitle: `${c.items.length} ligne${c.items.length > 1 ? 's' : ''} · ${formatEuroCents(c.totalCents)} · ${formatDateTime(c.updatedAt)}`,
        badge: STATUS_BADGE[status as 'OPEN' | 'VALIDATED' | 'CANCELLED'],
      };
    });
  }, [carts]);

  // Si la query renvoie une erreur structurelle (module désactivé / non
  // implémenté côté backend), on affiche un état "Module en cours".
  const moduleUnavailable =
    !loading && carts === null && error !== undefined;

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="ADHÉSIONS"
        title="Paniers d'adhésion"
        subtitle={`${carts?.length ?? 0} panier${(carts?.length ?? 0) > 1 ? 's' : ''}`}
        showBack
        compact
      />
      {moduleUnavailable ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="construct-outline"
            title="Module en cours"
            description={
              error?.message ??
              'Les paniers d\'adhésion ne sont pas disponibles dans cette version.'
            }
          />
        </View>
      ) : (
        <DataTable
          data={rows}
          loading={loading}
          onRefresh={() => void refetch()}
          refreshing={loading}
          emptyTitle="Aucun panier"
          emptySubtitle="Les inscriptions familiales en cours apparaîtront ici."
          emptyIcon="cart-outline"
          onPressRow={(id) =>
            navigation.navigate('MembershipCartDetail', { cartId: id })
          }
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  emptyWrap: {
    paddingVertical: spacing.huge,
    paddingHorizontal: spacing.lg,
  },
});
