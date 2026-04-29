import { useQuery } from '@apollo/client/react';
import {
  Button,
  Card,
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
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { CLUB_MEMBERSHIP_CART } from '../../lib/documents/memberships';
import type { MembersStackParamList } from '../../navigation/types';

type Rt = RouteProp<MembersStackParamList, 'MembershipCartDetail'>;

type Item = {
  id: string;
  memberFullName: string;
  membershipProductLabel: string | null;
  billingRhythm: string;
  subscriptionAdjustedCents: number;
  oneTimeFeesCents: number;
  lineTotalCents: number;
};

type PendingItem = {
  id: string;
  firstName: string;
  lastName: string;
  membershipProductLabels: string[];
  estimatedTotalCents: number;
};

type Cart = {
  id: string;
  familyId: string;
  payerFullName: string | null;
  status: 'OPEN' | 'VALIDATED' | 'CANCELLED' | string;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
  items: Item[];
  pendingItems: PendingItem[];
};

type Data = { clubMembershipCart: Cart };

const STATUS_TONE: Record<
  'OPEN' | 'VALIDATED' | 'CANCELLED',
  'warning' | 'success' | 'neutral'
> = {
  OPEN: 'warning',
  VALIDATED: 'success',
  CANCELLED: 'neutral',
};

const STATUS_LABEL: Record<'OPEN' | 'VALIDATED' | 'CANCELLED', string> = {
  OPEN: 'En cours',
  VALIDATED: 'Validé',
  CANCELLED: 'Annulé',
};

export function MembershipCartDetailScreen() {
  const route = useRoute<Rt>();
  const cartId = route.params.cartId;

  const { data, loading, error, refetch } = useQuery<Data>(
    CLUB_MEMBERSHIP_CART,
    {
      variables: { id: cartId },
      errorPolicy: 'all',
    },
  );

  if (loading && !data) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero eyebrow="PANIER" title="Chargement…" showBack compact />
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={palette.primary} />
        </View>
      </ScreenContainer>
    );
  }

  const cart = data?.clubMembershipCart;
  if (!cart) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero eyebrow="PANIER" title="Indisponible" showBack compact />
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="construct-outline"
            title="Module en cours"
            description={
              error?.message ?? 'Ce panier n\'a pas pu être chargé.'
            }
          />
        </View>
      </ScreenContainer>
    );
  }

  const status =
    cart.status === 'OPEN' ||
    cart.status === 'VALIDATED' ||
    cart.status === 'CANCELLED'
      ? (cart.status as 'OPEN' | 'VALIDATED' | 'CANCELLED')
      : 'OPEN';

  return (
    <ScreenContainer
      padding={0}
      onRefresh={() => void refetch()}
      refreshing={loading}
    >
      <ScreenHero
        eyebrow="PANIER"
        title={cart.payerFullName ?? `Foyer #${cart.familyId.slice(0, 8)}`}
        subtitle={formatDateTime(cart.updatedAt)}
        showBack
      />

      <View style={styles.content}>
        <Card title="Synthèse">
          <View style={styles.row}>
            <Text style={styles.lineLabel}>Statut</Text>
            <Pill label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
          </View>
          <View style={styles.row}>
            <Text style={styles.lineLabel}>Total</Text>
            <Text style={styles.totalValue}>
              {formatEuroCents(cart.totalCents)}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.lineLabel}>Items</Text>
            <Text style={styles.lineValue}>
              {cart.items.length + cart.pendingItems.length}
            </Text>
          </View>
        </Card>

        <Card title="Lignes du panier">
          {cart.items.length === 0 ? (
            <Text style={styles.emptyText}>Aucune ligne pour l'instant.</Text>
          ) : (
            cart.items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemBody}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {item.memberFullName}
                  </Text>
                  {item.membershipProductLabel ? (
                    <Text style={styles.itemSubtitle} numberOfLines={1}>
                      {item.membershipProductLabel}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.itemPrice}>
                  {formatEuroCents(item.lineTotalCents)}
                </Text>
              </View>
            ))
          )}
        </Card>

        {cart.pendingItems.length > 0 ? (
          <Card title="Inscriptions en attente">
            {cart.pendingItems.map((p) => (
              <View key={p.id} style={styles.itemRow}>
                <View style={styles.itemBody}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {p.firstName} {p.lastName}
                  </Text>
                  <Text style={styles.itemSubtitle} numberOfLines={1}>
                    {p.membershipProductLabels.join(' · ') || '—'}
                  </Text>
                </View>
                <Text style={styles.itemPrice}>
                  {formatEuroCents(p.estimatedTotalCents)}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        <Card title="Actions">
          <View style={styles.actions}>
            <Button
              label="Valider le panier"
              icon="checkmark-circle-outline"
              variant="primary"
              onPress={() =>
                Alert.alert('Bientôt', 'La validation arrive bientôt.')
              }
              fullWidth
              disabled={status !== 'OPEN'}
            />
            <Button
              label="Annuler le panier"
              icon="close-circle-outline"
              variant="ghost"
              onPress={() =>
                Alert.alert('Bientôt', 'L\'annulation arrive bientôt.')
              }
              fullWidth
              disabled={status !== 'OPEN'}
            />
          </View>
        </Card>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loaderWrap: {
    paddingVertical: spacing.huge,
    alignItems: 'center',
  },
  emptyWrap: {
    paddingVertical: spacing.huge,
    paddingHorizontal: spacing.lg,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  lineLabel: {
    ...typography.small,
    color: palette.muted,
  },
  lineValue: {
    ...typography.bodyStrong,
    color: palette.ink,
    flexShrink: 1,
    textAlign: 'right',
  },
  totalValue: {
    ...typography.h3,
    color: palette.primary,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  itemBody: { flex: 1, gap: 2 },
  itemTitle: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  itemSubtitle: {
    ...typography.small,
    color: palette.muted,
  },
  itemPrice: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  emptyText: {
    ...typography.small,
    color: palette.muted,
    paddingVertical: spacing.sm,
  },
  actions: { gap: spacing.sm },
});
