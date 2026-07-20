import { useMutation, useQuery } from '@apollo/client/react';
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
  TextField,
} from '../components/ui';
import { absolutizeMediaUrl } from '../lib/absolutize-url';
import { formatEuroCents } from '../lib/format';
import {
  VIEWER_PLACE_SHOP_ORDER,
  VIEWER_SHOP_ORDERS,
  VIEWER_SHOP_PRODUCTS,
  type ViewerPlaceShopOrderData,
  type ViewerShopOrder,
  type ViewerShopOrdersData,
  type ViewerShopProduct,
  type ViewerShopProductsData,
  type ViewerShopVariant,
} from '../lib/shop-documents';
import { palette, radius, shadow, spacing, typography } from '../lib/theme';

/** Libellé affiché pour une déclinaison, jamais vide. */
function variantLabel(v: ViewerShopVariant): string {
  return v.label ?? 'Modèle unique';
}

/**
 * Déclinaison proposée par défaut : la première disponible, sinon la
 * première tout court. Présélectionner une taille épuisée forcerait
 * l'adhérent à comprendre le sélecteur avant de pouvoir acheter.
 */
function defaultVariantOf(p: ViewerShopProduct): ViewerShopVariant | null {
  return p.variants.find((v) => v.inStock) ?? p.variants[0] ?? null;
}

function frDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
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
 * Boutique mobile — parité fonctionnelle avec
 * `apps/member-portal/src/pages/ShopPage.tsx`, en version smartphone-first
 * (cards verticales, chips de déclinaison plutôt qu'un `<select>`, CTA
 * pleine largeur).
 *
 * ── Stock : « Disponible » / « Épuisé », jamais un chiffre ──────────────
 * La seule information de stock manipulée par cet écran est le booléen
 * `inStock` de la déclinaison (ADR-0012). Le stepper « + » n'a donc PAS de
 * plafond numérique : quand `inStock` est faux, c'est le stepper entier qui
 * disparaît au profit du message d'épuisement. Le vrai plafond est tenu par
 * le `updateMany` conditionnel du serveur, qui refuse la commande et dont
 * l'erreur remonte dans l'Alert. Un plafond arbitraire côté client
 * (« ?? 99 ») ne bornerait rien et trahirait une quantité.
 */
export function ShopScreen() {
  const insets = useSafeAreaInsets();

  const {
    data: prodData,
    loading: prodLoading,
    error: prodError,
  } = useQuery<ViewerShopProductsData>(VIEWER_SHOP_PRODUCTS, {
    fetchPolicy: 'cache-and-network',
  });
  const { data: ordData, refetch: refetchOrders } =
    useQuery<ViewerShopOrdersData>(VIEWER_SHOP_ORDERS, {
      fetchPolicy: 'cache-and-network',
      errorPolicy: 'all',
    });
  const [placeOrder, { loading: placing }] =
    useMutation<ViewerPlaceShopOrderData>(VIEWER_PLACE_SHOP_ORDER);

  // Mémoïsé : `?? []` fabriquerait un tableau neuf à chaque rendu, donc
  // reconstruirait l'index des déclinaisons et le total pour rien.
  const products = useMemo(
    () => prodData?.viewerShopProducts ?? [],
    [prodData],
  );
  const orders = ordData?.viewerShopOrders ?? [];

  /**
   * Panier indexé par DÉCLINAISON, pas par produit (ADR-0012) : c'est la
   * déclinaison qui porte le prix et la disponibilité, et deux tailles du
   * même t-shirt sont deux lignes distinctes. Volatile — quitter l'écran
   * le vide, exactement comme le portail.
   */
  const [cart, setCart] = useState<Map<string, number>>(new Map());
  /** Déclinaison choisie par produit. Absente = `defaultVariantOf`. */
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  const [note, setNote] = useState('');

  /**
   * Index déclinaison → (produit, déclinaison). Point de résolution unique
   * du panier : le total, l'affichage des lignes et l'envoi de la commande
   * le partagent, donc ils ne peuvent pas diverger.
   */
  const byVariantId = useMemo(() => {
    const idx = new Map<
      string,
      { product: ViewerShopProduct; variant: ViewerShopVariant }
    >();
    for (const product of products) {
      for (const variant of product.variants) {
        idx.set(variant.id, { product, variant });
      }
    }
    return idx;
  }, [products]);

  const total = useMemo(() => {
    let sum = 0;
    for (const [variantId, qty] of cart.entries()) {
      const hit = byVariantId.get(variantId);
      if (hit) sum += hit.variant.unitPriceCents * qty;
    }
    return sum;
  }, [cart, byVariantId]);

  function setQty(variantId: string, quantity: number) {
    setCart((prev) => {
      const next = new Map(prev);
      if (quantity <= 0) next.delete(variantId);
      else next.set(variantId, quantity);
      return next;
    });
  }

  function pickVariant(productId: string, variantId: string) {
    setPicked((prev) => new Map(prev).set(productId, variantId));
  }

  async function handlePlaceOrder() {
    // Une déclinaison disparue du catalogue entre l'ajout au panier et la
    // validation ne part pas au serveur : on n'envoie que ce qu'on sait
    // encore résoudre.
    const lines = Array.from(cart.entries())
      .filter(([variantId]) => byVariantId.has(variantId))
      .map(([variantId, quantity]) => ({ variantId, quantity }));
    if (lines.length === 0) return;
    try {
      await placeOrder({
        variables: { input: { lines, note: note.trim() || undefined } },
      });
      setCart(new Map());
      setNote('');
      await refetchOrders();
      Alert.alert(
        'Commande enregistrée',
        'Votre club a bien reçu votre commande.',
      );
    } catch (err) {
      // Le refus de survente arrive ici : le serveur est seul juge de la
      // disponibilité, et son message est plus juste que tout ce que cet
      // écran pourrait deviner.
      Alert.alert(
        'Commande impossible',
        err instanceof Error ? err.message : 'Erreur inconnue.',
      );
    }
  }

  const cartLines = Array.from(cart.entries())
    .map(([variantId, qty]) => {
      const hit = byVariantId.get(variantId);
      return hit ? { variantId, qty, ...hit } : null;
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  return (
    <View style={styles.flex}>
      <ScreenHero
        eyebrow="BOUTIQUE"
        title="Boutique"
        subtitle="Commandez les articles proposés par votre club."
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
        keyboardShouldPersistTaps="handled"
      >
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

            // Un produit actif dont toutes les déclinaisons ont été
            // désactivées n'a plus rien de vendable : il n'y a pas
            // d'identité à mettre dans le panier.
            if (!variant) {
              return (
                <Card key={p.id}>
                  <Text style={styles.productName}>{p.name}</Text>
                  <Text style={styles.oos}>Indisponible</Text>
                </Card>
              );
            }

            const img = absolutizeMediaUrl(p.imageUrl);
            const qty = cart.get(variant.id) ?? 0;

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

                {/* Le sélecteur n'apparaît QUE pour un produit qui a de
                    vraies déclinaisons. Un porte-clés reste la carte
                    d'avant (ADR-0012 §1). */}
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
                  {/* Prix de la déclinaison choisie : il peut varier d'une
                      taille à l'autre (ADR-0012 §6). */}
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
                  <View style={styles.stepper}>
                    <Pressable
                      onPress={() => setQty(variant.id, qty - 1)}
                      disabled={qty === 0}
                      accessibilityRole="button"
                      accessibilityLabel="Retirer un article"
                      style={({ pressed }) => [
                        styles.stepBtn,
                        qty === 0 && styles.stepBtnDisabled,
                        pressed && styles.stepBtnPressed,
                      ]}
                    >
                      <Ionicons
                        name="remove"
                        size={20}
                        color={qty === 0 ? palette.mutedSoft : palette.primary}
                      />
                    </Pressable>
                    <Text style={styles.stepQty}>{qty}</Text>
                    <Pressable
                      onPress={() => setQty(variant.id, qty + 1)}
                      accessibilityRole="button"
                      accessibilityLabel="Ajouter un article"
                      style={({ pressed }) => [
                        styles.stepBtn,
                        pressed && styles.stepBtnPressed,
                      ]}
                    >
                      <Ionicons name="add" size={20} color={palette.primary} />
                    </Pressable>
                  </View>
                )}
              </Card>
            );
          })
        )}

        {cartLines.length > 0 ? (
          <Card title="Votre panier">
            {cartLines.map((l) => (
              <View key={l.variantId} style={styles.cartLine}>
                <Text style={styles.cartLineLabel} numberOfLines={2}>
                  {l.qty} × {l.product.name}
                  {l.product.hasVariants
                    ? ` — ${variantLabel(l.variant)}`
                    : ''}
                </Text>
                <Text style={styles.cartLineAmount}>
                  {formatEuroCents(l.variant.unitPriceCents * l.qty)}
                </Text>
              </View>
            ))}
            <TextField
              label="Commentaire (optionnel)"
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={500}
              placeholder="Une précision pour le club ?"
            />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatEuroCents(total)}</Text>
            </View>
            <GradientButton
              label="Passer commande"
              icon="bag-check-outline"
              onPress={() => void handlePlaceOrder()}
              loading={placing}
              disabled={placing}
              fullWidth
            />
          </Card>
        ) : null}

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
                  {/* `label` a figé le libellé (déclinaison comprise) à la
                      commande : l'historique reste juste même si le produit
                      est renommé ou la déclinaison retirée. */}
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
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primaryTint,
    borderWidth: 1,
    borderColor: palette.primaryLight,
  },
  stepBtnDisabled: {
    backgroundColor: palette.bgAlt,
    borderColor: palette.border,
  },
  stepBtnPressed: { opacity: 0.7 },
  stepQty: { ...typography.h3, color: palette.ink, minWidth: 24, textAlign: 'center' },
  cartLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  cartLineLabel: { ...typography.body, color: palette.body, flex: 1 },
  cartLineAmount: { ...typography.bodyStrong, color: palette.ink },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  totalLabel: { ...typography.bodyStrong, color: palette.body },
  totalValue: { ...typography.h2, color: palette.ink },
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
