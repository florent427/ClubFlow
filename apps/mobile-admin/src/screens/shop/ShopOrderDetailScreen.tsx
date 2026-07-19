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
} from '../../lib/documents/shop';
import type { ShopStackParamList } from '../../navigation/types';

type Route = RouteProp<ShopStackParamList, 'OrderDetail'>;

type OrderLine = {
  id: string;
  productId: string;
  /** Null sur les lignes antérieures aux déclinaisons — elles restent lisibles. */
  variantId: string | null;
  quantity: number;
  unitPriceCents: number;
  /** Intitulé figé à la commande : « Maillot — L / Rouge ». */
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

type OrdersData = { shopOrders: Order[] };

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

  // Le détail n'interroge PLUS le catalogue : chaque ligne porte son propre
  // `label` et son `unitPriceCents`, figés à la commande. Recroiser
  // `shopProducts` afficherait le prix d'aujourd'hui sur une vente d'hier, et
  // « produit indisponible » dès qu'une référence est retirée du catalogue.
  const {
    data: ordersData,
    loading: ordersLoading,
    error,
    refetch,
  } = useQuery<OrdersData>(SHOP_ORDERS, { errorPolicy: 'all' });

  const order = useMemo(
    () => ordersData?.shopOrders.find((o) => o.id === orderId) ?? null,
    [ordersData, orderId],
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
    // Distinguer les deux causes : `errorPolicy: 'all'` rend une liste vide
    // quand la requête échoue entièrement, ce qui se lit sinon comme une
    // commande supprimée alors que c'est l'appel qui n'est jamais passé.
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="COMMANDE"
          title={error ? 'Erreur' : 'Introuvable'}
          compact
          showBack
        />
        <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <EmptyState
            icon="alert-circle-outline"
            title={error ? 'Chargement impossible' : 'Commande introuvable'}
            description={
              error
                ? error.message
                : "La commande n'existe plus ou n'est pas accessible."
            }
          />
        </Card>
      </ScreenContainer>
    );
  }

  const buyerName = [order.buyerFirstName, order.buyerLastName]
    .filter((part): part is string => !!part && part.trim().length > 0)
    .join(' ');

  const customerLabel = buyerName
    ? buyerName
    : order.memberId
      ? `Adhérent · ${order.memberId.slice(0, 8)}…`
      : order.contactId
        ? `Contact · ${order.contactId.slice(0, 8)}…`
        : 'Client anonyme';

  const totalQuantity = order.lines.reduce((sum, l) => sum + l.quantity, 0);

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

        <Card
          title={
            order.lines.length > 1
              ? `Articles (${order.lines.length})`
              : 'Article'
          }
        >
          {order.lines.length > 0 ? (
            <View style={styles.metaList}>
              {order.lines.map((line) => (
                <View key={line.id} style={styles.line}>
                  <Text style={styles.lineLabel} numberOfLines={2}>
                    {line.label}
                  </Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>
                      {line.quantity} × {formatEuroCents(line.unitPriceCents)}
                    </Text>
                    <Text style={styles.metaValue}>
                      {formatEuroCents(line.unitPriceCents * line.quantity)}
                    </Text>
                  </View>
                </View>
              ))}
              <MetaRow
                label={`Total · ${totalQuantity} article${totalQuantity > 1 ? 's' : ''}`}
                value={formatEuroCents(order.totalCents)}
              />
            </View>
          ) : (
            <EmptyState
              icon="cube-outline"
              title="Aucune ligne"
              description="Cette commande ne contient aucun article."
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
            {order.paidAt ? (
              <MetaRow
                label="Payée le"
                value={formatDateTime(order.paidAt)}
              />
            ) : null}
            {order.note ? (
              <MetaRow label="Note" value={order.note} />
            ) : null}
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
  line: {
    gap: 2,
  },
  lineLabel: {
    ...typography.body,
    color: palette.ink,
    fontWeight: '600',
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
