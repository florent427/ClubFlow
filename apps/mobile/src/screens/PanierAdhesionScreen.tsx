import { useMutation, useQuery } from '@apollo/client/react';
import { useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AnimatedPressable,
  Card,
  EmptyState,
  GradientButton,
  Pill,
  ScreenHero,
  Skeleton,
} from '../components/ui';
import { CartItemFeesSection } from '../components/CartItemFeesSection';
import { RegisterChildMemberCta } from '../components/RegisterChildMemberCta';
import { RegisterSelfMemberCta } from '../components/RegisterSelfMemberCta';
import {
  VIEWER_ACTIVE_CART,
  VIEWER_OPEN_CART,
  VIEWER_REMOVE_CART_PENDING_ITEM,
  VIEWER_VALIDATE_CART,
  type Cart,
  type CartPendingItem,
  type ViewerActiveCartData,
} from '../lib/cart-documents';
import { VIEWER_ME } from '../lib/viewer-documents';
import type { ViewerMeData } from '../lib/viewer-types';
import { palette, radius, shadow, spacing, typography } from '../lib/theme';

function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  });
}

function frDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Panier d'adhésion mobile — parité fonctionnelle avec
 * apps/member-portal/src/pages/AdhesionPage.tsx mais en version
 * smartphone-first (cards verticales, CTA pleine largeur, modale enfant
 * réutilisée via RegisterChildMemberCta).
 *
 * Visible uniquement si `canManageMembershipCart` (typiquement le payeur
 * du foyer) — sinon on affiche un message d'orientation.
 */
export function PanierAdhesionScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const { data: meData } = useQuery<ViewerMeData>(VIEWER_ME, {
    fetchPolicy: 'cache-first',
  });
  const canManageMembershipCart =
    meData?.viewerMe?.canManageMembershipCart === true;

  const { data, loading, error, refetch } = useQuery<ViewerActiveCartData>(
    VIEWER_ACTIVE_CART,
    { fetchPolicy: 'cache-and-network', skip: !canManageMembershipCart },
  );
  const cart: Cart | null = data?.viewerActiveMembershipCart ?? null;

  const [openCart, { loading: opening }] = useMutation(VIEWER_OPEN_CART, {
    refetchQueries: [{ query: VIEWER_ACTIVE_CART }],
    awaitRefetchQueries: true,
  });
  const [removePending, { loading: removing }] = useMutation(
    VIEWER_REMOVE_CART_PENDING_ITEM,
    {
      refetchQueries: [{ query: VIEWER_ACTIVE_CART }],
      awaitRefetchQueries: true,
    },
  );
  const [validateCart, { loading: validating }] = useMutation(
    VIEWER_VALIDATE_CART,
    {
      refetchQueries: [{ query: VIEWER_ACTIVE_CART }],
      awaitRefetchQueries: true,
    },
  );

  async function handleOpen() {
    try {
      await openCart();
    } catch (err) {
      Alert.alert(
        'Impossible d’ouvrir le panier',
        err instanceof Error ? err.message : 'Erreur inconnue.',
      );
    }
  }

  function confirmRemovePending(p: CartPendingItem) {
    const fullName = `${p.firstName} ${p.lastName}`;
    Alert.alert(
      `Retirer ${fullName} ?`,
      'Action immédiate et réversible — vous pourrez l’ajouter à nouveau.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: async () => {
            try {
              await removePending({ variables: { pendingItemId: p.id } });
            } catch (err) {
              Alert.alert(
                'Suppression impossible',
                err instanceof Error ? err.message : 'Erreur inconnue.',
              );
            }
          },
        },
      ],
    );
  }

  function confirmValidate() {
    if (!cart) return;
    Alert.alert(
      'Valider le panier ?',
      'Une facture sera émise pour le total ci-dessous. Vous pourrez la régler depuis l’onglet Famille.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Valider',
          style: 'default',
          onPress: async () => {
            try {
              await validateCart({ variables: { cartId: cart.id } });
              Alert.alert(
                'Panier validé',
                'La facture a été générée. Direction l’onglet Famille pour le règlement.',
              );
            } catch (err) {
              Alert.alert(
                'Validation impossible',
                err instanceof Error ? err.message : 'Erreur inconnue.',
              );
            }
          },
        },
      ],
    );
  }

  if (!meData) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  if (!canManageMembershipCart) {
    return (
      <View style={styles.flex}>
        <ScreenHero
          eyebrow="ADHÉSION"
          title="Panier"
          subtitle="Réservé au payeur du foyer."
          gradient="hero"
        />
        <ScrollView contentContainerStyle={styles.scroll}>
          <EmptyState
            icon="lock-closed-outline"
            title="Accès réservé au payeur"
            description="Seul l’adulte désigné payeur du foyer peut ouvrir et gérer le panier d’adhésion. Demandez-lui de s’en charger — il pourra ensuite vous y ajouter."
            variant="card"
          />
        </ScrollView>
      </View>
    );
  }

  const itemsCount = (cart?.items.length ?? 0) + (cart?.pendingItems.length ?? 0);

  return (
    <View style={styles.flex}>
      <ScreenHero
        eyebrow={cart?.clubSeasonLabel ?? 'SAISON ACTIVE'}
        title="Panier d’adhésion"
        subtitle="Composez les inscriptions du foyer puis validez quand vous êtes prêt."
        gradient="hero"
        compact
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + spacing.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <EmptyState
            icon="alert-circle-outline"
            title="Panier indisponible"
            description={error.message}
            variant="card"
          />
        ) : null}

        {loading && !cart ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={140} borderRadius={radius.xl} />
            <Skeleton height={120} borderRadius={radius.xl} />
          </View>
        ) : !cart ? (
          <Card title="Aucun panier en cours">
            <Text style={styles.body}>
              Ouvrez un panier pour la saison active. Vous pourrez ensuite
              ajouter vos enfants et vous-même.
            </Text>
            <View style={{ marginTop: spacing.md }}>
              <GradientButton
                label={opening ? 'Création…' : 'Créer mon panier'}
                icon="basket-outline"
                onPress={() => void handleOpen()}
                disabled={opening}
                fullWidth
              />
            </View>
          </Card>
        ) : cart.status === 'VALIDATED' ? (
          <Card title="Adhésion validée">
            <View style={styles.validatedHead}>
              <View style={styles.validatedIcon}>
                <Ionicons
                  name="checkmark-circle"
                  size={28}
                  color={palette.success}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.validatedTitle}>
                  Total TTC : {formatEuros(cart.totalCents)}
                </Text>
                <Text style={styles.validatedSub}>
                  Validé le{' '}
                  {cart.validatedAt
                    ? new Date(cart.validatedAt).toLocaleDateString('fr-FR')
                    : '—'}
                </Text>
              </View>
            </View>
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <GradientButton
                label="Voir mes factures"
                icon="receipt-outline"
                onPress={() => navigation.navigate('Famille' as never)}
                fullWidth
              />
              <GradientButton
                label={opening ? 'Création…' : 'Ouvrir un nouveau panier'}
                icon="add-circle-outline"
                onPress={() => void handleOpen()}
                disabled={opening}
                gradient="dark"
                fullWidth
              />
            </View>
          </Card>
        ) : cart.status === 'CANCELLED' ? (
          <Card title="Panier annulé">
            <Text style={styles.body}>
              {cart.cancelledReason ?? 'Le club a annulé ce panier.'}
            </Text>
            <View style={{ marginTop: spacing.md }}>
              <GradientButton
                label={opening ? 'Création…' : 'Ouvrir un nouveau panier'}
                icon="basket-outline"
                onPress={() => void handleOpen()}
                disabled={opening}
                fullWidth
              />
            </View>
          </Card>
        ) : (
          <>
            {/* === Tête de panier === */}
            <Card
              title={`Membres (${itemsCount})`}
              headerRight={
                cart.requiresManualAssignmentCount > 0 ? (
                  <Pill
                    tone="warning"
                    label={`${cart.requiresManualAssignmentCount} alerte${
                      cart.requiresManualAssignmentCount > 1 ? 's' : ''
                    }`}
                  />
                ) : null
              }
            >
              {itemsCount === 0 ? (
                <Text style={styles.body}>
                  Le panier est vide. Ajoutez un enfant via le bouton
                  ci-dessous.
                </Text>
              ) : null}

              {cart.items.length > 0 ? (
                <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                  {cart.items.map((it) => (
                    <View key={it.id} style={styles.itemBlock}>
                      <View style={styles.itemRow}>
                        <Ionicons
                          name="person-circle-outline"
                          size={28}
                          color={palette.primary}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemName}>
                            {it.memberFullName}
                          </Text>
                          <Text style={styles.itemSub}>
                            {it.membershipProductLabel ?? 'Formule à choisir'}{' '}
                            ·{' '}
                            {it.billingRhythm === 'ANNUAL'
                              ? 'annuel'
                              : 'mensuel'}
                          </Text>
                        </View>
                        <Text style={styles.itemAmt}>
                          {formatEuros(it.lineTotalCents)}
                        </Text>
                      </View>
                      {/* Section frais ponctuels (LICENSE toggle / OPTIONAL
                          checkboxes / MANDATORY info-only). Visible
                          uniquement si le club a des fees configurés. */}
                      {cart.clubOneTimeFees.length > 0 ? (
                        <CartItemFeesSection
                          kind="item"
                          item={it}
                          clubOneTimeFees={cart.clubOneTimeFees}
                        />
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}

              {cart.pendingItems.length > 0 ? (
                <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                  <Text style={styles.sectionLabel}>
                    Inscriptions en attente
                  </Text>
                  {cart.pendingItems.map((p) => {
                    const fullName = `${p.firstName} ${p.lastName}`;
                    return (
                      <View key={p.id} style={styles.pendingCard}>
                        <View style={styles.pendingHead}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemName}>{fullName}</Text>
                            <Text style={styles.itemSub}>
                              Né(e) le {frDate(p.birthDate)} ·{' '}
                              {p.billingRhythm === 'ANNUAL'
                                ? 'annuel'
                                : 'mensuel'}
                            </Text>
                          </View>
                          <AnimatedPressable
                            onPress={() => confirmRemovePending(p)}
                            disabled={removing}
                            accessibilityRole="button"
                            accessibilityLabel={`Retirer ${fullName}`}
                            haptic
                            style={styles.removeBtn}
                          >
                            <Ionicons
                              name="trash-outline"
                              size={18}
                              color={palette.danger}
                            />
                          </AnimatedPressable>
                        </View>

                        {/* Détail des formules */}
                        <View style={{ gap: 4, marginTop: spacing.sm }}>
                          {p.perProduct.length > 0
                            ? p.perProduct.map((entry) => (
                                <View
                                  key={entry.productId}
                                  style={styles.lineRow}
                                >
                                  <Text style={styles.lineLabel}>
                                    {entry.productLabel}
                                  </Text>
                                  <Text style={styles.lineAmt}>
                                    {formatEuros(
                                      entry.subscriptionAdjustedCents,
                                    )}
                                  </Text>
                                </View>
                              ))
                            : (
                              <View style={styles.lineRow}>
                                <Text style={styles.lineLabel}>
                                  {p.membershipProductLabels.join(', ') ||
                                    'Formules sélectionnées'}
                                </Text>
                                <Text style={styles.lineAmt}>
                                  {formatEuros(p.subscriptionAdjustedCents)}
                                </Text>
                              </View>
                            )}

                          {p.oneTimeFeesCents > 0 ? (
                            <View style={styles.lineRow}>
                              <Text style={styles.lineLabel}>
                                Frais uniques (licence…)
                              </Text>
                              <Text style={styles.lineAmt}>
                                {formatEuros(p.oneTimeFeesCents)}
                              </Text>
                            </View>
                          ) : null}

                          {p.pricingRulePreviews.map((r, idx) => (
                            <View key={idx} style={styles.lineRow}>
                              <Text style={[styles.lineLabel, styles.discount]}>
                                🎁 {r.ruleLabel}
                              </Text>
                              <Text style={[styles.lineAmt, styles.discount]}>
                                {r.deltaAmountCents < 0 ? '−' : '+'}
                                {formatEuros(Math.abs(r.deltaAmountCents))}
                              </Text>
                            </View>
                          ))}

                          <View style={[styles.lineRow, styles.lineTotal]}>
                            <Text style={styles.totalLabel}>Total ligne</Text>
                            <Text style={styles.totalAmt}>
                              {formatEuros(p.estimatedTotalCents)}
                            </Text>
                          </View>
                        </View>

                        {/* Frais ponctuels (toggle license + OPTIONAL +
                            MANDATORY info). Cf. CartItemFeesSection. */}
                        {cart.clubOneTimeFees.length > 0 ? (
                          <CartItemFeesSection
                            kind="pending"
                            pending={p}
                            clubOneTimeFees={cart.clubOneTimeFees}
                          />
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </Card>

            {/* === CTAs ajout au panier (enfant + soi-même) === */}
            <Card title="Ajouter au panier">
              <View style={{ gap: spacing.sm }}>
                <RegisterChildMemberCta
                  onSuccess={() => void refetch()}
                />
                <RegisterSelfMemberCta
                  onSuccess={() => void refetch()}
                />
              </View>
            </Card>

            {/* === Total + Validation === */}
            <Card title="Récapitulatif">
              <View style={styles.totalRow}>
                <Text style={styles.totalRowLabel}>Total TTC du panier</Text>
                <Text style={styles.totalRowAmt}>
                  {formatEuros(cart.totalCents)}
                </Text>
              </View>
              <View style={{ marginTop: spacing.md }}>
                <GradientButton
                  label={
                    validating
                      ? 'Validation…'
                      : `Valider mon panier (${formatEuros(cart.totalCents)})`
                  }
                  icon="checkmark-circle-outline"
                  onPress={confirmValidate}
                  disabled={validating || !cart.canValidate || itemsCount === 0}
                  fullWidth
                />
              </View>
              {!cart.canValidate && itemsCount > 0 ? (
                <Text style={styles.warn}>
                  Le panier ne peut pas encore être validé (alertes à
                  résoudre côté club).
                </Text>
              ) : null}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  centered: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },

  body: { ...typography.body, color: palette.body },
  warn: {
    ...typography.small,
    color: palette.warningText,
    marginTop: spacing.sm,
  },

  validatedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  validatedIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  validatedTitle: { ...typography.bodyStrong, color: palette.ink },
  validatedSub: { ...typography.small, color: palette.muted },

  itemBlock: {
    backgroundColor: palette.bgAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  itemName: { ...typography.bodyStrong, color: palette.ink },
  itemSub: { ...typography.small, color: palette.muted, marginTop: 2 },
  itemAmt: { ...typography.bodyStrong, color: palette.ink },

  sectionLabel: {
    ...typography.smallStrong,
    color: palette.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  pendingCard: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.18)',
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.sm,
  },
  pendingHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 2,
  },
  lineLabel: { ...typography.small, color: palette.body, flex: 1 },
  lineAmt: { ...typography.small, color: palette.ink },
  discount: { color: '#0f766e' },

  lineTotal: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(37, 99, 235, 0.25)',
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  totalLabel: { ...typography.bodyStrong, color: palette.ink },
  totalAmt: { ...typography.bodyStrong, color: palette.ink },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  totalRowLabel: { ...typography.bodyStrong, color: palette.ink },
  totalRowAmt: { ...typography.h3, color: palette.primary },
});
