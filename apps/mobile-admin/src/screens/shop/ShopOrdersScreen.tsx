import { useMutation, useQuery } from '@apollo/client/react';
import {
  BottomActionBar,
  DataTable,
  FilterChipBar,
  ScreenContainer,
  ScreenHero,
  formatDateShort,
  formatEuroCents,
  palette,
  spacing,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import {
  CANCEL_SHOP_ORDER,
  MARK_SHOP_ORDER_PAID,
  SHOP_ORDERS,
} from '../../lib/documents/shop';

type Order = {
  id: string;
  memberId: string | null;
  contactId: string | null;
  productId: string;
  quantity: number;
  totalCents: number;
  status: string;
  createdAt: string;
};

type Data = { shopOrders: Order[] };

const STATUS_BADGE: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  PENDING: {
    label: 'En attente',
    color: palette.warningText,
    bg: palette.warningBg,
  },
  PAID: { label: 'Payée', color: palette.successText, bg: palette.successBg },
  CANCELLED: {
    label: 'Annulée',
    color: palette.dangerText,
    bg: palette.dangerBg,
  },
};

export function ShopOrdersScreen() {
  const nav = useNavigation();
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [actionTargetId, setActionTargetId] = useState<string | null>(null);

  const { data, loading, refetch } = useQuery<Data>(SHOP_ORDERS, {
    errorPolicy: 'all',
  });
  const [markPaid, { loading: markingPaid }] = useMutation(MARK_SHOP_ORDER_PAID);
  const [cancelOrder, { loading: cancelling }] = useMutation(CANCEL_SHOP_ORDER);

  const orders = data?.shopOrders ?? [];
  const target = orders.find((o) => o.id === actionTargetId) ?? null;

  const rows = useMemo<DataTableRow[]>(() => {
    return orders
      .filter((o) => statusFilter == null || o.status === statusFilter)
      .map((o) => ({
        key: o.id,
        title: `${formatEuroCents(o.totalCents)} · ${o.quantity} article${o.quantity > 1 ? 's' : ''}`,
        subtitle: `Commande du ${formatDateShort(o.createdAt)}`,
        badge: STATUS_BADGE[o.status] ?? null,
      }));
  }, [orders, statusFilter]);

  const handleMarkPaid = async (id: string) => {
    try {
      await markPaid({ variables: { id } });
      await refetch();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Action impossible');
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await cancelOrder({ variables: { id } });
      await refetch();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Action impossible');
    }
  };

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="BOUTIQUE"
        title="Commandes"
        subtitle={`${orders.length} commande${orders.length > 1 ? 's' : ''}`}
        compact
      />
      <FilterChipBar
        chips={[
          { key: 'PENDING', label: 'En attente' },
          { key: 'PAID', label: 'Payées' },
          { key: 'CANCELLED', label: 'Annulées' },
        ]}
        activeKey={statusFilter}
        onSelect={setStatusFilter}
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Aucune commande"
        emptySubtitle="Les commandes apparaîtront ici."
        emptyIcon="bag-outline"
        onPressRow={(id) =>
          (nav as any).navigate('ShopOrderDetail', { orderId: id })
        }
        onLongPressRow={(id) => {
          const o = orders.find((x) => x.id === id);
          if (o?.status === 'PENDING') setActionTargetId(id);
        }}
      />

      <BottomActionBar
        visible={actionTargetId != null && target?.status === 'PENDING'}
        onClose={() => setActionTargetId(null)}
        actions={[
          {
            key: 'paid',
            label: 'Marquer comme payée',
            icon: 'checkmark-circle-outline',
            tone: 'primary',
            disabled: markingPaid,
          },
          {
            key: 'cancel',
            label: 'Annuler la commande',
            icon: 'close-circle-outline',
            tone: 'danger',
            disabled: cancelling,
          },
        ]}
        onAction={(key) => {
          const id = actionTargetId;
          setActionTargetId(null);
          if (!id) return;
          if (key === 'paid') void handleMarkPaid(id);
          if (key === 'cancel') void handleCancel(id);
        }}
      />
    </ScreenContainer>
  );
}
