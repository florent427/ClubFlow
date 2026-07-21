import { useMutation, useQuery } from '@apollo/client/react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
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
  ScreenHero,
  Skeleton,
} from '../../components/ui';
import { absolutizeMediaUrl } from '../../lib/absolutize-url';
import { formatEuroCents } from '../../lib/format';
import { shopCartItemCount } from '../../lib/shop-cart';
import { canCancelShopOrder, canPayShopOrder } from '../../lib/shop-payment';
import {
  VIEWER_ADD_SHOP_CART_ITEM,
  VIEWER_CANCEL_SHOP_ORDER,
  VIEWER_REPAY_SHOP_ORDER,
  VIEWER_SHOP_CART,
  VIEWER_SHOP_ORDERS,
  VIEWER_SHOP_PRODUCTS,
  type ViewerAddShopCartItemData,
  type ViewerCancelShopOrderData,
  type ViewerRepayShopOrderData,
  type ViewerShopCartData,
  type ViewerShopOrder,
  type ViewerShopOrdersData,
  type ViewerShopProduct,
  type ViewerShopProductsData,
  type ViewerShopVariant,
} from '../../lib/shop-documents';
import { palette, radius, shadow, spacing, typography } from '../../lib/theme';
import { useStripePayment } from '../../lib/useStripePayment';
import type { ShopStackParamList } from '../../types/navigation';

/** Libellé affiché pour une déclinaison, jamais vide. */
function variantLabel(v: ViewerShopVariant): string {
  return v.label ?? 'Modèle unique';
}

/**
 * Déclinaison proposée par défaut : la première disponible, sinon la
 * première tout court.
 */
function defaultVariantOf(p: ViewerShopProduct): ViewerShopVariant | null {
  return p.variants.find((v) => v.inStock) ?? p.variants[0] ?? null;
}

function frDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

function statusPill(status: ViewerShopOrder['status']): {
  label: string;
  tone: 'success' | 'warning' | 'neutral';
} {
  if (status === 'PAID') return { label: 'Payée', tone: 'success' };
  if (status === 'CANCELLED') return { label: 'Annulée', tone: 'neutral' };
  return { label: 'En attente', tone: 'warning' };
}

/**
 * Catalogue boutique mobile (ADR-0012) — étape 1 du parcours PANIER.
 *
 * ── On ajoute au panier via un BOUTON, pas via un stepper ────────────────
 * La déclinaison (taille / couleur) se choisit d'abord par chips, puis le
 * bouton « Ajouter au panier » pousse UNE unité au panier serveur
 * (`viewerAddShopCartItem`, qui CUMULE côté serveur). La quantité se règle
 * ensuite dans l'écran panier dédié. Le bouton disparaît au profit du message
 * d'épuisement quand `inStock` est faux — jamais un chiffre de stock.
 *
 * ── Confidentialité ──────────────────────────────────────────────────────
 * La seule info de stock manipulée est le booléen `inStock`. Aucun plafond
 * numérique côté client : le serveur arbitre la survente au checkout.
 */
export function ShopCatalogScreen() {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<ShopStackParamList>>();

  const {
    data: prodData,
    loading: prodLoading,
    error: prodError,
  } = useQuery<ViewerShopProductsData>(VIEWER_SHOP_PRODUCTS, {
    fetchPolicy: 'cache-and-network',
  });
  const { data: ordData } = useQuery<ViewerShopOrdersData>(VIEWER_SHOP_ORDERS, {
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
  });
  const { data: cartData } = useQuery<ViewerShopCartData>(VIEWER_SHOP_CART, {
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
  });

  // Le panier serveur renvoyé par la mutation a le même id + __typename : la
  // requête VIEWER_SHOP_CART se met à jour, mais l'id passe de "" (panier
  // jamais matérialisé) à un vrai id lors du 1er ajout — deux entités
  // distinctes pour Apollo. On refetch donc explicitement pour garantir que le
  // badge « panier » reflète l'état réel après chaque ajout.
  const [addItem, { loading: adding }] =
    useMutation<ViewerAddShopCartItemData>(VIEWER_ADD_SHOP_CART_ITEM, {
      refetchQueries: [{ query: VIEWER_SHOP_CART }],
    });

  // Reprise de paiement d'une commande PENDING : NE change PAS l'état de la
  // commande (elle reste PENDING), le refetch est géré par `runStripePayment`
  // au retour « paid ». Pas de refetchQueries ici.
  const [repayOrder] = useMutation<ViewerRepayShopOrderData>(
    VIEWER_REPAY_SHOP_ORDER,
  );
  // Annulation : bascule la commande en CANCELLED et libère le stock — on
  // refetch la liste pour refléter le nouveau statut (et le stock rouvert).
  const [cancelOrder] = useMutation<ViewerCancelShopOrderData>(
    VIEWER_CANCEL_SHOP_ORDER,
    { refetchQueries: [{ query: VIEWER_SHOP_ORDERS }] },
  );
  const runStripePayment = useStripePayment();
  /** Commande en cours d'action (repay/cancel) → boutons désactivés. */
  const [actioningOrderId, setActioningOrderId] = useState<string | null>(null);

  const products = useMemo(
    () => prodData?.viewerShopProducts ?? [],
    [prodData],
  );
  const orders = ordData?.viewerShopOrders ?? [];
  const cart = cartData?.viewerShopCart ?? null;
  const cartCount = shopCartItemCount(cart);

  /** Déclinaison choisie par produit. Absente = `defaultVariantOf`. */
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  /** variantId récemment ajouté → feedback « Ajouté ✓ » transitoire. */
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [addingVariantId, setAddingVariantId] = useState<string | null>(null);

  function pickVariant(productId: string, variantId: string) {
    setPicked((prev) => new Map(prev).set(productId, variantId));
  }

  async function handleAdd(variant: ViewerShopVariant) {
    setAddingVariantId(variant.id);
    try {
      await addItem({ variables: { input: { variantId: variant.id, quantity: 1 } } });
      setJustAdded(variant.id);
      setTimeout(() => {
        setJustAdded((cur) => (cur === variant.id ? null : cur));
      }, 1600);
    } catch (err) {
      // Refus serveur (ex. « Cet article est épuisé. ») affiché tel quel :
      // c'est lui qui connaît la disponibilité réelle.
      Alert.alert(
        'Ajout impossible',
        err instanceof Error ? err.message : 'Erreur inconnue.',
      );
    } finally {
      setAddingVariantId((cur) => (cur === variant.id ? null : cur));
    }
  }

  /**
   * Reprend le paiement d'une commande PENDING via Stripe (navigateur intégré
   * qui se referme au retour). Même flux que le checkout ; le serveur arbitre
   * le 3× et son refus est affiché tel quel.
   */
  async function doRepay(order: ViewerShopOrder, wantsInstallments: boolean) {
    setActioningOrderId(order.id);
    try {
      let res;
      try {
        const { data } = await repayOrder({
          variables: { orderId: order.id, wantsInstallments },
        });
        res = data?.viewerRepayShopOrder;
      } catch (err) {
        // Refus serveur (3× sous le seuil, commande déjà payée/annulée,
        // facture non réglable en ligne…) affiché tel quel.
        Alert.alert(
          'Paiement impossible',
          err instanceof Error ? err.message : 'Erreur inconnue.',
        );
        return;
      }
      if (!res?.stripeCheckoutUrl || !res.paymentReturnUrl) {
        Alert.alert(
          'Indisponible',
          'Impossible de reprendre le paiement. Réessayez plus tard.',
        );
        return;
      }
      let outcome;
      try {
        outcome = await runStripePayment(res);
      } catch {
        Alert.alert(
          'Paiement non ouvert',
          'Le paiement n’a pas pu s’ouvrir. Réessayez plus tard.',
        );
        return;
      }
      if (outcome === 'paid') {
        // ⚠️ « paid » = Stripe a accepté, PAS « payée en base » : c'est le
        // webhook (asynchrone) qui bascule le statut. On ne l'affirme pas.
        Alert.alert(
          'Paiement reçu',
          'Votre commande est en cours de confirmation. Son statut se mettra à jour ici même.',
        );
      } else if (outcome === 'canceled') {
        Alert.alert(
          'Paiement annulé',
          'La commande reste en attente, vous pourrez la régler plus tard.',
        );
      }
    } finally {
      setActioningOrderId((cur) => (cur === order.id ? null : cur));
    }
  }

  function openRepayChoice(order: ViewerShopOrder) {
    Alert.alert(
      'Régler ma commande',
      `Total : ${formatEuroCents(order.totalCents)}\nChoisissez le mode de règlement. Le paiement en 3× n’est proposé qu’au-delà du montant fixé par le club.`,
      [
        { text: 'Payer en 1 fois', onPress: () => void doRepay(order, false) },
        { text: 'Payer en 3 fois', onPress: () => void doRepay(order, true) },
        { text: 'Annuler', style: 'cancel' },
      ],
      { cancelable: true },
    );
  }

  function confirmCancelOrder(order: ViewerShopOrder) {
    Alert.alert(
      'Annuler cette commande ?',
      'Le stock réservé sera libéré. Cette action est définitive.',
      [
        { text: 'Retour', style: 'cancel' },
        {
          text: 'Annuler la commande',
          style: 'destructive',
          onPress: async () => {
            setActioningOrderId(order.id);
            try {
              await cancelOrder({ variables: { orderId: order.id } });
            } catch (err) {
              Alert.alert(
                'Annulation impossible',
                err instanceof Error ? err.message : 'Erreur inconnue.',
              );
            } finally {
              setActioningOrderId((cur) => (cur === order.id ? null : cur));
            }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.flex}>
      <ScreenHero
        eyebrow="BOUTIQUE"
        title="Boutique"
        subtitle="Composez votre panier puis réglez en ligne."
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
        {/* Accès au panier dédié — visible dès qu'il contient un article. */}
        {cartCount > 0 ? (
          <Pressable
            onPress={() => navigation.navigate('ShopCart')}
            accessibilityRole="button"
            accessibilityLabel={`Voir mon panier, ${cartCount} article${
              cartCount > 1 ? 's' : ''
            }, total ${formatEuroCents(cart?.totalCents ?? 0)}`}
            style={({ pressed }) => [
              styles.cartBar,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="bag-handle-outline" size={22} color="#ffffff" />
            <Text style={styles.cartBarText}>
              Mon panier · {cartCount} article{cartCount > 1 ? 's' : ''}
            </Text>
            <Text style={styles.cartBarTotal}>
              {formatEuroCents(cart?.totalCents ?? 0)}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#ffffff" />
          </Pressable>
        ) : null}

        {prodLoading && products.length === 0 ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={120} borderRadius={radius.xl} />
            <Skeleton height={120} borderRadius={radius.xl} />
          </View>
        ) : prodError && products.length === 0 ? (
          <EmptyState
            icon="storefront-outline"
            title="Boutique indisponible"
            description="Le catalogue n'a pas pu être chargé. Réessayez plus tard."
            variant="card"
          />
        ) : products.length === 0 ? (
          <EmptyState
            icon="storefront-outline"
            title="Aucun article"
            description="Votre club ne propose aucun article pour le moment."
            variant="card"
          />
        ) : (
          products.map((p) => {
            const pickedId = picked.get(p.id);
            const variant =
              (pickedId ? p.variants.find((v) => v.id === pickedId) : null) ??
              defaultVariantOf(p);

            if (!variant) {
              return (
                <Card key={p.id}>
                  <Text style={styles.productName}>{p.name}</Text>
                  <Text style={styles.oos}>Indisponible</Text>
                </Card>
              );
            }

            const img = absolutizeMediaUrl(p.imageUrl);
            const isAdded = justAdded === variant.id;
            const isAddingThis = adding && addingVariantId === variant.id;

            return (
              <Card key={p.id} style={styles.productCard}>
                {img ? (
                  <Image
                    source={{ uri: img }}
                    style={styles.productImage}
                    resizeMode="cover"
                    accessibilityIgnoresInvertColors
                  />
                ) : null}

                <Text style={styles.productName}>{p.name}</Text>
                {p.description ? (
                  <Text style={styles.productDesc}>{p.description}</Text>
                ) : null}

                {p.hasVariants ? (
                  <View style={styles.variantBlock}>
                    <Text style={styles.variantTitle}>Déclinaison</Text>
                    <View style={styles.variantRow}>
                      {p.variants.map((v) => {
                        const selected = v.id === variant.id;
                        return (
                          <Pressable
                            key={v.id}
                            onPress={() => pickVariant(p.id, v.id)}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={`${variantLabel(v)}${
                              v.inStock ? '' : ', épuisé'
                            }`}
                            style={({ pressed }) => [
                              styles.chip,
                              selected && styles.chipSelected,
                              !v.inStock && styles.chipOut,
                              pressed && styles.chipPressed,
                            ]}
                          >
                            <Text
                              style={[
                                styles.chipLabel,
                                selected && styles.chipLabelSelected,
                                !v.inStock && styles.chipLabelOut,
                              ]}
                              numberOfLines={1}
                            >
                              {variantLabel(v)}
                              {v.inStock ? '' : ' · épuisé'}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                <View style={styles.priceRow}>
                  <Text style={styles.price}>
                    {formatEuroCents(variant.unitPriceCents)}
                  </Text>
                  <Pill
                    label={variant.inStock ? 'Disponible' : 'Épuisé'}
                    tone={variant.inStock ? 'success' : 'neutral'}
                    icon={
                      variant.inStock
                        ? 'checkmark-circle-outline'
                        : 'close-circle-outline'
                    }
                  />
                </View>

                {!variant.inStock ? (
                  <Text style={styles.oos}>
                    {p.hasVariants
                      ? `${variantLabel(variant)} : épuisé`
                      : 'Rupture de stock'}
                  </Text>
                ) : (
                  <View style={{ marginTop: spacing.xs }}>
                    <GradientButton
                      label={isAdded ? 'Ajouté au panier ✓' : 'Ajouter au panier'}
                      icon={isAdded ? 'checkmark-circle-outline' : 'add-outline'}
                      onPress={() => void handleAdd(variant)}
                      loading={isAddingThis}
                      disabled={adding}
                      gradient={isAdded ? 'cool' : 'primary'}
                      glow={isAdded ? 'none' : 'primary'}
                      fullWidth
                    />
                  </View>
                )}
              </Card>
            );
          })
        )}

        <Card title="Mes commandes">
          {orders.length === 0 ? (
            <EmptyState
              icon="receipt-outline"
              title="Aucune commande"
              description="Vos commandes apparaîtront ici."
            />
          ) : (
            orders.map((o) => {
              const pill = statusPill(o.status);
              const busyThis = actioningOrderId === o.id;
              const showActions =
                canPayShopOrder(o.status) || canCancelShopOrder(o.status);
              return (
                <View key={o.id} style={styles.orderCard}>
                  <View style={styles.orderHead}>
                    <Text style={styles.orderDate}>
                      {frDateTime(o.createdAt)}
                    </Text>
                    <Pill label={pill.label} tone={pill.tone} />
                  </View>
                  {o.lines.map((line) => (
                    <View key={line.id} style={styles.orderLine}>
                      <Text style={styles.orderLineLabel} numberOfLines={2}>
                        {line.quantity} × {line.label}
                      </Text>
                      <Text style={styles.orderLineAmount}>
                        {formatEuroCents(line.unitPriceCents * line.quantity)}
                      </Text>
                    </View>
                  ))}
                  <Text style={styles.orderTotal}>
                    Total : {formatEuroCents(o.totalCents)}
                  </Text>

                  {/* Actions réservées aux commandes EN ATTENTE (PENDING). Une
                      commande payée ou annulée n'en a aucune. */}
                  {showActions ? (
                    <View style={styles.orderActions}>
                      {canPayShopOrder(o.status) ? (
                        <Button
                          label="Payer"
                          icon="card-outline"
                          size="sm"
                          onPress={() => openRepayChoice(o)}
                          disabled={busyThis}
                          loading={busyThis}
                          style={styles.orderActionBtn}
                        />
                      ) : null}
                      {canCancelShopOrder(o.status) ? (
                        <Button
                          label="Annuler"
                          icon="close-circle-outline"
                          variant="ghost"
                          size="sm"
                          onPress={() => confirmCancelOrder(o)}
                          disabled={busyThis}
                          style={styles.orderActionBtn}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </Card>
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
  cartBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...shadow.sm,
  },
  cartBarText: { ...typography.bodyStrong, color: '#ffffff', flex: 1 },
  cartBarTotal: { ...typography.bodyStrong, color: '#ffffff' },
  productCard: { gap: spacing.sm },
  productImage: {
    width: '100%',
    height: 160,
    borderRadius: radius.lg,
    backgroundColor: palette.bgAlt,
  },
  productName: { ...typography.h3, color: palette.ink },
  productDesc: { ...typography.small, color: palette.muted },
  variantBlock: { gap: spacing.xs, marginTop: spacing.xs },
  variantTitle: { ...typography.smallStrong, color: palette.body },
  variantRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  chipSelected: {
    borderColor: palette.primary,
    backgroundColor: palette.primaryTint,
  },
  chipOut: { backgroundColor: palette.bgAlt, borderColor: palette.border },
  chipPressed: { opacity: 0.75 },
  chipLabel: { ...typography.smallStrong, color: palette.body },
  chipLabelSelected: { color: palette.primaryDark },
  chipLabelOut: { color: palette.mutedSoft },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  price: { ...typography.h3, color: palette.ink },
  oos: { ...typography.small, color: palette.muted },
  orderCard: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    padding: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.sm,
    ...shadow.sm,
  },
  orderHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  orderDate: { ...typography.small, color: palette.muted, flex: 1 },
  orderLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  orderLineLabel: { ...typography.small, color: palette.body, flex: 1 },
  orderLineAmount: { ...typography.smallStrong, color: palette.ink },
  orderTotal: {
    ...typography.bodyStrong,
    color: palette.ink,
    marginTop: spacing.xs,
  },
  orderActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  orderActionBtn: { flex: 1 },
});
