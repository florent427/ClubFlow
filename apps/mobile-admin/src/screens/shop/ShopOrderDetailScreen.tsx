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
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  CANCEL_SHOP_ORDER,
  MARK_SHOP_ORDER_PAID,
  SHOP_ORDERS,
  SHOP_PRODUCTS,
} from '../../lib/documents/shop';
import type { ShopStackParamList } from '../../navigation/types';

type Route = RouteProp<ShopStackParamList, 'OrderDetail'>;

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

type Product = {
  id: string;
  name: string;
  sku: string | null;
  priceCents: number;
  stock: number | null;
  active: boolean;
  imageUrl: string | null;
  createdAt: string;
};

type OrdersData = { shopOrders: Order[] };
type ProductsData = { shopProducts: Product[] };

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'En attente',
  PAID: 'Payée',
  CANCELLED: 'Annulée',
};

const STATUS_TONE: Record<string, 'warning' | 'success' | 'danger'> = {
  PENDING: 'warning',
  PAID: 'success',
  CANCELLED: 'danger',
};

export function ShopOrderDetailScreen() {
  const route = useRoute<Route>();
  const { orderId } = route.params;

  const { data: ordersData, loading: ordersLoading, refetch } =
    useQuery<OrdersData>(SHOP_ORDERS, { errorPolicy: 'all' });
  const { data: productsData } = useQuery<ProductsData>(SHOP_PRODUCTS, {
    errorPolicy: 'all',
  });

  const order = useMemo(
    () => ordersData?.shopOrders.find((o) => o.id === orderId) ?? null,
    [ordersData, orderId],
  );

  const product = useMemo(
    () =>
      order
        ? productsData?.shopProducts.find((p) => p.id === order.productId) ??
          null
        : null,
    [productsData, order],
  );

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmPaid, setConfirmPaid] = useState(false);

  const [markPaid, { loading: markingPaid }] = useMutation(
    MARK_SHOP_ORDER_PAID,
  );
  const [cancelOrder, { loading: cancelling }] = useMutation(
    CANCEL_SHOP_ORDER,
  );

  const onMarkPaid = async () => {
    if (!order) return;
    try {
      await markPaid({ variables: { id: order.id } });
      setConfirmPaid(false);
      await refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Action impossible.';
      Alert.alert('Erreur', msg);
    }
  };

  const onCancel = async () => {
    if (!order) return;
    try {
      await cancelOrder({ variables: { id: order.id } });
      setConfirmCancel(false);
      await refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Action impossible.';
      Alert.alert('Erreur', msg);
    }
  };

  if (ordersLoading && !order) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="COMMANDE"
          title="Chargement…"
          compact
          showBack
        />
      </ScreenContainer>
    );
  }

  if (!order) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="COMMANDE"
          title="Introuvable"
          compact
          showBack
        />
        <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <EmptyState
            icon="alert-circle-outline"
            title="Commande introuvable"
            description="La commande n'existe plus ou n'est pas accessible."
          />
        </Card>
      </ScreenContainer>
    );
  }

  const customerLabel = order.memberId
    ? `Adhérent · ${order.memberId.slice(0, 8)}…`
    : order.contactId
      ? `Contact · ${order.contactId.slice(0, 8)}…`
      : 'Client anonyme';

  return (
    <ScreenContainer
      padding={0}
      onRefresh={() => void refetch()}
      refreshing={ordersLoading}
    >
      <ScreenHero
        eyebrow="COMMANDE"
        title={formatEuroCents(order.totalCents)}
        subtitle={STATUS_LABEL[order.status] ?? order.status}
        compact
        showBack
      />

      <View style={styles.body}>
        <Card title="Statut">
          <View style={styles.pillRow}>
            <Pill
              label={STATUS_LABEL[order.status] ?? order.status}
              tone={STATUS_TONE[order.status] ?? 'neutral'}
            />
          </View>
        </Card>

        <Card title="Produit">
          {product ? (
            <View style={styles.metaList}>
              <MetaRow label="Article" value={product.name} />
              {product.sku ? (
                <MetaRow label="SKU" value={product.sku} />
              ) : null}
              <MetaRow
                label="Prix unitaire"
                value={formatEuroCents(product.priceCents)}
              />
              <MetaRow label="Quantité" value={String(order.quantity)} />
              <MetaRow
                label="Total"
                value={formatEuroCents(order.totalCents)}
              />
            </View>
          ) : (
            <EmptyState
              icon="cube-outline"
              title="Produit indisponible"
              description="Le produit lié à cette commande a été supprimé."
            />
          )}
        </Card>

        <Card title="Client">
          <View style={styles.metaList}>
            <MetaRow label="Identité" value={customerLabel} />
            <MetaRow
              label="Commande"
              value={formatDateTime(order.createdAt)}
            />
          </View>
        </Card>

        {order.status === 'PENDING' ? (
          <Card title="Actions">
            <View style={styles.actions}>
              <Button
                label="Marquer comme payée"
                variant="primary"
                icon="checkmark-circle-outline"
                onPress={() => setConfirmPaid(true)}
                loading={markingPaid}
              />
              <Button
                label="Annuler la commande"
                variant="danger"
                icon="close-circle-outline"
                onPress={() => setConfirmCancel(true)}
              />
            </View>
          </Card>
        ) : null}
      </View>

      <ConfirmSheet
        visible={confirmPaid}
        onCancel={() => setConfirmPaid(false)}
        onConfirm={() => void onMarkPaid()}
        title="Marquer comme payée ?"
        message="La commande passera au statut Payée."
        confirmLabel="Marquer payée"
        loading={markingPaid}
      />
      <ConfirmSheet
        visible={confirmCancel}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void onCancel()}
        title="Annuler la commande ?"
        message="Cette action passe la commande au statut Annulée."
        confirmLabel="Annuler la commande"
        destructive
        loading={cancelling}
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
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
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
  actions: {
    gap: spacing.sm,
  },
});
