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
import {
  VIEWER_ADD_SHOP_CART_ITEM,
  VIEWER_SHOP_CART,
  VIEWER_SHOP_ORDERS,
  VIEWER_SHOP_PRODUCTS,
  type ViewerAddShopCartItemData,
  type ViewerShopCartData,
  type ViewerShopOrder,
  type ViewerShopOrdersData,
  type ViewerShopProduct,
  type ViewerShopProductsData,
  type ViewerShopVariant,
} from '../../lib/shop-documents';
import { palette, radius, shadow, spacing, typography } from '../../lib/theme';
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
});
