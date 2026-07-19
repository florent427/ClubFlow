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

type OrderLine = {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPriceCents: number;
  /** Intitulé figé à la commande — survit au renommage du produit. */
  label: string;
};

type Order = {
  id: string;
  memberId: string | null;
  contactId: string | null;
  totalCents: number;
  status: string;
  note: string | null;
  createdAt: string;
  paidAt: string | null;
  buyerFirstName: string | null;
  buyerLastName: string | null;
  lines: OrderLine[];
};

type Data = { shopOrders: Order[] };

/** Total d'articles commandés, toutes lignes confondues. */
function totalQuantity(order: Order): number {
  return order.lines.reduce((sum, l) => sum + l.quantity, 0);
}

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

  // `errorPolicy: 'all'` rend les données partielles exploitables, mais il
  // transforme aussi un échec TOTAL en liste vide. C'est ce qui a permis à une
  // requête invalide de s'afficher comme « aucune commande » pendant tout le
  // passage au multi-lignes. On récupère donc `error` pour le DIRE à l'écran.
  const { data, loading, error, refetch } = useQuery<Data>(SHOP_ORDERS, {
    errorPolicy: 'all',
  });
  const [markPaid, { loading: markingPaid }] = useMutation(MARK_SHOP_ORDER_PAID);
  const [cancelOrder, { loading: cancelling }] = useMutation(CANCEL_SHOP_ORDER);

  const orders = data?.shopOrders ?? [];
  const target = orders.find((o) => o.id === actionTargetId) ?? null;

  const rows = useMemo<DataTableRow[]>(() => {
    return orders
      .filter((o) => statusFilter == null || o.status === statusFilter)
      .map((o) => {
        const qty = totalQuantity(o);
        // Une seule ligne : on annonce l'article. Plusieurs : on annonce leur
        // nombre, sinon le libellé de la première laisserait croire que la
        // commande ne contient que celui-là.
        const what =
          o.lines.length === 0
            ? 'Commande'
            : o.lines.length === 1
              ? o.lines[0].label
              : `${o.lines.length} références`;
        return {
          key: o.id,
          title: `${formatEuroCents(o.totalCents)} · ${qty} article${qty > 1 ? 's' : ''}`,
          subtitle: `${what} · ${formatDateShort(o.createdAt)}`,
          badge: STATUS_BADGE[o.status] ?? null,
        };
      });
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
        emptyTitle={error ? 'Chargement impossible' : 'Aucune commande'}
        emptySubtitle={
          error
            ? error.message
            : 'Les commandes apparaîtront ici.'
        }
        emptyIcon={error ? 'alert-circle-outline' : 'bag-outline'}
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
