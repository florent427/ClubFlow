import { useMutation, useQuery } from '@apollo/client/react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  Card,
  EmptyState,
  GradientButton,
  Pill,
  Skeleton,
} from '../../components/ui';
import { absolutizeMediaUrl } from '../../lib/absolutize-url';
import { formatEuroCents } from '../../lib/format';
import {
  canCheckoutShopCart,
  shopCartHasBlockingItems,
} from '../../lib/shop-cart';
import {
  VIEWER_CHECKOUT_SHOP_CART,
  VIEWER_CHECKOUT_SHOP_CART_ON_SITE,
  VIEWER_CLEAR_SHOP_CART,
  VIEWER_REMOVE_SHOP_CART_ITEM,
  VIEWER_SET_SHOP_CART_ITEM_QUANTITY,
  VIEWER_SHOP_CART,
  VIEWER_SHOP_ORDERS,
  type ShopCartItem,
  type ViewerCheckoutShopCartData,
  type ViewerCheckoutShopCartOnSiteData,
  type ViewerClearShopCartData,
  type ViewerRemoveShopCartItemData,
  type ViewerSetShopCartItemQuantityData,
  type ViewerShopCartData,
} from '../../lib/shop-documents';
import { palette, radius, spacing, typography } from '../../lib/theme';
import { useStripePayment } from '../../lib/useStripePayment';
import type { ShopStackParamList } from '../../types/navigation';

/**
 * Panier boutique dédié (ADR-0012) — étape 2 du parcours.
 *
 * On y règle la quantité (stepper), on retire une ligne, on vide, puis on
 * paie via Stripe. Le choix 1× / 3× est proposé au checkout ; comme
 * l'adhérent ne peut PAS lire le seuil du 3× (query admin-only), on propose
 * les deux et on laisse le serveur ARBITRER — son refus (« 3× indisponible
 * pour ce montant », rupture…) est affiché TEL QUEL, jamais reformulé.
 *
 * ── Confidentialité ──────────────────────────────────────────────────────
 * Le stepper « + » n'a AUCUN plafond client : borner à un stock connu
 * trahirait la quantité. On n'affiche que `inStock` / `unavailable`
 * (booléens). Le serveur arbitre la survente.
 */
export function ShopCartScreen() {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<ShopStackParamList>>();

  const { data, loading, error } = useQuery<ViewerShopCartData>(
    VIEWER_SHOP_CART,
    { fetchPolicy: 'cache-and-network', errorPolicy: 'all' },
  );
  const cart = data?.viewerShopCart ?? null;

  // set / remove / clear renvoient le MÊME panier (id stable une fois
  // matérialisé) : Apollo fusionne le résultat dans le cache normalisé et la
  // requête VIEWER_SHOP_CART se met à jour sans refetch.
  const [setQuantity, { loading: settingQty }] =
    useMutation<ViewerSetShopCartItemQuantityData>(
      VIEWER_SET_SHOP_CART_ITEM_QUANTITY,
    );
  const [removeItem, { loading: removing }] =
    useMutation<ViewerRemoveShopCartItemData>(VIEWER_REMOVE_SHOP_CART_ITEM);
  const [clearCart, { loading: clearing }] =
    useMutation<ViewerClearShopCartData>(VIEWER_CLEAR_SHOP_CART);
  // Le checkout vide le panier CÔTÉ SERVEUR et crée une commande : on refetch
  // les deux (panier désormais vide + nouvelle commande PENDING).
  const [checkout, { loading: checkingOut }] =
    useMutation<ViewerCheckoutShopCartData>(VIEWER_CHECKOUT_SHOP_CART, {
      refetchQueries: [
        { query: VIEWER_SHOP_CART },
        { query: VIEWER_SHOP_ORDERS },
      ],
    });
  // « Régler sur place » : crée la commande PENDING + réserve le stock, SANS
  // Stripe. Le panier est vidé côté serveur : on refetch les deux (panier vide +
  // nouvelle commande PENDING qui apparaît dans « Mes commandes »).
  const [checkoutOnSite, { loading: checkingOutOnSite }] =
    useMutation<ViewerCheckoutShopCartOnSiteData>(
      VIEWER_CHECKOUT_SHOP_CART_ON_SITE,
      {
        refetchQueries: [
          { query: VIEWER_SHOP_CART },
          { query: VIEWER_SHOP_ORDERS },
        ],
      },
    );

  const runStripePayment = useStripePayment();

  const busy =
    settingQty || removing || clearing || checkingOut || checkingOutOnSite;

  async function changeQty(item: ShopCartItem, next: number) {
    try {
      await setQuantity({
        variables: { input: { itemId: item.id, quantity: next } },
      });
    } catch (err) {
      Alert.alert(
        'Mise à jour impossible',
        err instanceof Error ? err.message : 'Erreur inconnue.',
      );
    }
  }

  function confirmRemove(item: ShopCartItem) {
    Alert.alert(
      'Retirer cet article ?',
      item.label,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeItem({ variables: { itemId: item.id } });
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

  function confirmClear() {
    Alert.alert(
      'Vider le panier ?',
      'Tous les articles seront retirés.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Vider',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearCart();
            } catch (err) {
              Alert.alert(
                'Impossible de vider le panier',
                err instanceof Error ? err.message : 'Erreur inconnue.',
              );
            }
          },
        },
      ],
    );
  }

  /**
   * Lance le checkout puis ouvre Stripe dans un navigateur INTÉGRÉ qui se
   * referme dès le retour vers `paymentReturnUrl` — l'adhérent revient DANS
   * l'app, plus sur le portail web déconnecté.
   */
  async function doCheckout(wantsInstallments: boolean) {
    let checkoutRes;
    try {
      const { data: res } = await checkout({ variables: { wantsInstallments } });
      checkoutRes = res?.viewerCheckoutShopCart;
    } catch (err) {
      // Cœur de l'exigence : le refus vient du SERVEUR (3× sous le seuil, 3×
      // désactivé, rupture au moment de réserver le stock). On l'affiche tel
      // quel — le panier n'est PAS consommé (rollback transaction), l'adhérent
      // peut retenter en 1×.
      Alert.alert(
        'Paiement impossible',
        err instanceof Error ? err.message : 'Erreur inconnue.',
      );
      return;
    }

    if (!checkoutRes?.stripeCheckoutUrl || !checkoutRes.paymentReturnUrl) {
      Alert.alert(
        'Indisponible',
        'Impossible d’initier le paiement. Réessayez plus tard.',
      );
      return;
    }

    // La commande est créée (PENDING) et le panier vidé côté serveur : quoi
    // qu'il arrive on repart au catalogue, où la commande apparaît. Le tunnel
    // Stripe s'ouvre en navigateur intégré et se referme tout seul au retour.
    let outcome;
    try {
      outcome = await runStripePayment(checkoutRes);
    } catch {
      // Échec d'ouverture du navigateur : la commande PENDING existe déjà,
      // l'adhérent pourra la reprendre depuis « Mes commandes ».
      navigation.navigate('ShopCatalog');
      Alert.alert(
        'Paiement à finaliser',
        'La commande a été créée mais le paiement n’a pas pu s’ouvrir. Retrouvez-la dans « Mes commandes » pour la régler ou l’annuler.',
      );
      return;
    }

    navigation.navigate('ShopCatalog');
    if (outcome === 'paid') {
      // ⚠️ « paid » = Stripe a accepté, PAS « payée en base ». La bascule PAID
      // est faite par le webhook (asynchrone) : on ne l'affirme donc pas.
      Alert.alert(
        'Paiement reçu',
        'Votre commande est en cours de confirmation. Son statut se mettra à jour dans « Mes commandes ».',
      );
    } else if (outcome === 'canceled') {
      Alert.alert(
        'Paiement annulé',
        'Vous pourrez reprendre le règlement depuis « Mes commandes ».',
      );
    }
    // 'dismissed' (fermeture sans finir) : pas de pop-up superflue, la commande
    // reste visible et reprenable dans « Mes commandes ».
  }

  /**
   * Paiement par CARTE (Stripe). Le choix 1× / 3× ne concerne QUE ce mode : le
   * serveur arbitre le 3× (refus sous le seuil / 3× désactivé) et son message
   * remonte tel quel.
   */
  function openCardPaymentChoice() {
    if (!cart) return;
    Alert.alert(
      'Payer par carte',
      `Total : ${formatEuroCents(cart.totalCents)}\nChoisissez le mode de règlement. Le paiement en 3× n’est proposé qu’au-delà du montant fixé par le club.`,
      [
        { text: 'Payer en 1 fois', onPress: () => void doCheckout(false) },
        { text: 'Payer en 3 fois', onPress: () => void doCheckout(true) },
        { text: 'Annuler', style: 'cancel' },
      ],
      { cancelable: true },
    );
  }

  /**
   * « Régler sur place » : valide le panier SANS paiement en ligne. La commande
   * part en PENDING et le stock est réservé ; l'adhérent règlera au club. Pas de
   * 3× ici (le 3× ne concerne que la carte). Le refus serveur (panier vide,
   * article épuisé au moment de réserver) est affiché TEL QUEL.
   */
  async function doCheckoutOnSite() {
    try {
      await checkoutOnSite();
    } catch (err) {
      Alert.alert(
        'Validation impossible',
        err instanceof Error ? err.message : 'Erreur inconnue.',
      );
      return;
    }
    // Le panier est vidé et la commande PENDING créée côté serveur (refetchée) :
    // on repart au catalogue, où elle apparaît dans « Mes commandes ».
    navigation.navigate('ShopCatalog');
    Alert.alert(
      'Commande validée',
      'Réglez sur place au club — elle sera confirmée après paiement.',
    );
  }

  function confirmOnSite() {
    if (!cart) return;
    Alert.alert(
      'Régler sur place',
      `Total : ${formatEuroCents(cart.totalCents)}\nVotre commande sera validée et les articles réservés. Vous réglerez directement au club (espèces ou chèque) ; elle sera confirmée par le club après paiement. Aucun paiement en ligne.`,
      [
        { text: 'Valider la commande', onPress: () => void doCheckoutOnSite() },
        { text: 'Annuler', style: 'cancel' },
      ],
      { cancelable: true },
    );
  }

  const items = cart?.items ?? [];
  const hasBlocking = shopCartHasBlockingItems(items);
  const checkoutable = canCheckoutShopCart(cart);

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + spacing.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {loading && !cart ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={90} borderRadius={radius.xl} />
            <Skeleton height={90} borderRadius={radius.xl} />
          </View>
        ) : error && !cart ? (
          <EmptyState
            icon="alert-circle-outline"
            title="Panier indisponible"
            description={error.message}
            variant="card"
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon="bag-outline"
            title="Votre panier est vide"
            description="Parcourez la boutique et ajoutez des articles à votre panier."
            variant="card"
          />
        ) : (
          <>
            <Card title={`Articles (${items.length})`}>
              <View style={{ gap: spacing.sm }}>
                {items.map((item) => {
                  const img = absolutizeMediaUrl(item.imageUrl);
                  return (
                    <View key={item.id} style={styles.line}>
                      <View style={styles.lineTop}>
                        {img ? (
                          <Image
                            source={{ uri: img }}
                            style={styles.thumb}
                            resizeMode="cover"
                            accessibilityIgnoresInvertColors
                          />
                        ) : (
                          <View style={[styles.thumb, styles.thumbEmpty]}>
                            <Ionicons
                              name="shirt-outline"
                              size={22}
                              color={palette.mutedSoft}
                            />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.lineLabel} numberOfLines={2}>
                            {item.label}
                          </Text>
                          <Text style={styles.lineUnit}>
                            {formatEuroCents(item.unitPriceCents)} l’unité
                          </Text>
                          <View style={styles.lineBadgeRow}>
                            {item.unavailable ? (
                              <Pill
                                label="Indisponible"
                                tone="danger"
                                icon="close-circle-outline"
                              />
                            ) : (
                              <Pill
                                label={item.inStock ? 'Disponible' : 'Épuisé'}
                                tone={item.inStock ? 'success' : 'neutral'}
                                icon={
                                  item.inStock
                                    ? 'checkmark-circle-outline'
                                    : 'close-circle-outline'
                                }
                              />
                            )}
                          </View>
                        </View>
                        <Pressable
                          onPress={() => confirmRemove(item)}
                          disabled={busy}
                          accessibilityRole="button"
                          accessibilityLabel={`Retirer ${item.label}`}
                          style={styles.removeBtn}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={18}
                            color={palette.danger}
                          />
                        </Pressable>
                      </View>

                      <View style={styles.lineBottom}>
                        <View style={styles.stepper}>
                          <Pressable
                            onPress={() => void changeQty(item, item.quantity - 1)}
                            disabled={busy}
                            accessibilityRole="button"
                            accessibilityLabel="Diminuer la quantité"
                            style={({ pressed }) => [
                              styles.stepBtn,
                              pressed && styles.stepBtnPressed,
                            ]}
                          >
                            <Ionicons
                              name={item.quantity <= 1 ? 'trash-outline' : 'remove'}
                              size={18}
                              color={palette.primary}
                            />
                          </Pressable>
                          <Text style={styles.stepQty}>{item.quantity}</Text>
                          <Pressable
                            onPress={() => void changeQty(item, item.quantity + 1)}
                            disabled={busy}
                            accessibilityRole="button"
                            accessibilityLabel="Augmenter la quantité"
                            style={({ pressed }) => [
                              styles.stepBtn,
                              pressed && styles.stepBtnPressed,
                            ]}
                          >
                            <Ionicons name="add" size={18} color={palette.primary} />
                          </Pressable>
                        </View>
                        <Text style={styles.lineTotal}>
                          {formatEuroCents(item.lineTotalCents)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              <Pressable
                onPress={confirmClear}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Vider le panier"
                style={styles.clearRow}
              >
                <Ionicons name="trash-outline" size={16} color={palette.danger} />
                <Text style={styles.clearText}>Vider le panier</Text>
              </Pressable>
            </Card>

            {hasBlocking ? (
              <Card flat style={styles.warnCard}>
                <View style={styles.warnRow}>
                  <Ionicons
                    name="warning-outline"
                    size={18}
                    color={palette.warningText}
                  />
                  <Text style={styles.warnText}>
                    Un ou plusieurs articles sont épuisés ou indisponibles.
                    Retirez-les avant de régler, sinon le paiement sera refusé.
                  </Text>
                </View>
              </Card>
            ) : null}

            <Card title="Récapitulatif">
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>
                  {formatEuroCents(cart?.totalCents ?? 0)}
                </Text>
              </View>
              {/* Deux modes de règlement, présentés côte à côte AVANT de
                  valider. Le 3× ne concerne que la carte (arbitré au checkout
                  Stripe) ; « sur place » crée une commande PENDING sans
                  paiement en ligne. */}
              <Text style={styles.choiceLabel}>Mode de règlement</Text>
              <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                <GradientButton
                  label="Payer par carte"
                  icon="card-outline"
                  onPress={openCardPaymentChoice}
                  loading={checkingOut}
                  disabled={!checkoutable || busy}
                  fullWidth
                />
                <Button
                  label="Régler sur place"
                  icon="cash-outline"
                  variant="ghost"
                  onPress={confirmOnSite}
                  loading={checkingOutOnSite}
                  disabled={!checkoutable || busy}
                  fullWidth
                />
              </View>
              <Text style={styles.hint}>
                Par carte : paiement sécurisé par Stripe (page hébergée). Sur
                place : votre commande est réservée et réglée au club (espèces
                ou chèque) ; elle sera confirmée après paiement.
              </Text>
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  line: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  lineTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: palette.bgAlt,
  },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  lineLabel: { ...typography.bodyStrong, color: palette.ink },
  lineUnit: { ...typography.small, color: palette.muted, marginTop: 2 },
  lineBadgeRow: { flexDirection: 'row', marginTop: spacing.xs },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primaryTint,
    borderWidth: 1,
    borderColor: palette.primaryLight,
  },
  stepBtnPressed: { opacity: 0.7 },
  stepQty: {
    ...typography.h3,
    color: palette.ink,
    minWidth: 24,
    textAlign: 'center',
  },
  lineTotal: { ...typography.bodyStrong, color: palette.ink },
  clearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  clearText: { ...typography.smallStrong, color: palette.danger },
  warnCard: {
    backgroundColor: palette.warningBg,
    borderWidth: 1,
    borderColor: palette.warningBorder,
  },
  warnRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  warnText: { ...typography.small, color: palette.warningText, flex: 1 },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: { ...typography.bodyStrong, color: palette.body },
  totalValue: { ...typography.h2, color: palette.ink },
  choiceLabel: {
    ...typography.smallStrong,
    color: palette.body,
    marginTop: spacing.md,
  },
  hint: {
    ...typography.small,
    color: palette.muted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
