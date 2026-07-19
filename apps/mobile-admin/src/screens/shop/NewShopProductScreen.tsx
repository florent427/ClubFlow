import { useMutation, useQuery } from '@apollo/client/react';
import {
  Button,
  Card,
  EmptyState,
  Pill,
  ScreenContainer,
  ScreenHero,
  TextField,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  CREATE_SHOP_PRODUCT,
  SHOP_PRODUCTS,
  UPDATE_SHOP_PRODUCT,
} from '../../lib/documents/shop';

type Product = {
  id: string;
  name: string;
  sku: string | null;
  priceCents: number;
  /** Champ DÉRIVÉ (ADR-0012) : somme des déclinaisons suivies, null = illimité. */
  stock: number | null;
  hasVariants: boolean;
  variantsBelowThreshold: number;
  active: boolean;
  imageUrl: string | null;
  createdAt: string;
};

type Data = { shopProducts: Product[] };

function eurosToCents(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const n = parseFloat(trimmed.replace(',', '.'));
  if (Number.isNaN(n) || n < 0) return null;
  return Math.round(n * 100);
}

function centsToEuros(c: number): string {
  return (c / 100).toFixed(2).replace('.', ',');
}

export function NewShopProductScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const params = (route.params ?? {}) as { productId?: string };
  const editingId = params.productId ?? null;
  const isEditing = editingId != null;

  const { data, loading } = useQuery<Data>(SHOP_PRODUCTS, {
    errorPolicy: 'all',
    skip: !isEditing,
  });

  const product = useMemo(
    () =>
      isEditing
        ? data?.shopProducts.find((p) => p.id === editingId) ?? null
        : null,
    [data, editingId, isEditing],
  );

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [active, setActive] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  /**
   * Un produit décliné ne se pilote PAS depuis ce formulaire.
   *
   * Le champ « stock » de la fiche produit s'applique à la variante par
   * défaut. Or dès qu'un axe existe, cette variante est désactivée au profit
   * de la matrice : y écrire produirait un mouvement de stock sur une
   * déclinaison qui n'est plus vendue — un chiffre faux, archivé comme vrai.
   * L'édition des déclinaisons reste sur l'admin web.
   */
  const hasVariants = product?.hasVariants ?? false;

  // Note: description n'est pas dans la query liste — on laisse vide en édition,
  // l'utilisateur peut la repréciser. Côté GraphQL update, le champ est optionnel.

  useEffect(() => {
    if (!isEditing) {
      // Création : pas d'hydratation
      return;
    }
    if (!hydrated && product) {
      setName(product.name);
      setSku(product.sku ?? '');
      setImageUrl(product.imageUrl ?? '');
      setPrice(centsToEuros(product.priceCents));
      // Sur un produit décliné, le champ n'est pas affiché : l'hydrater avec
      // le cumul le renverrait tel quel sur la variante par défaut.
      setStock(
        !product.hasVariants && product.stock != null
          ? String(product.stock)
          : '',
      );
      setActive(product.active);
      setHydrated(true);
    }
  }, [isEditing, hydrated, product]);

  const [createProduct, { loading: creating }] = useMutation(
    CREATE_SHOP_PRODUCT,
  );
  const [updateProduct, { loading: updating }] = useMutation(
    UPDATE_SHOP_PRODUCT,
  );
  const submitting = creating || updating;

  const onSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Champ requis', 'Le nom est obligatoire.');
      return;
    }
    const priceCents = eurosToCents(price);
    if (priceCents == null) {
      Alert.alert('Prix invalide', 'Saisissez un prix en euros (ex: 12.50).');
      return;
    }

    let stockNum: number | undefined = undefined;
    if (!hasVariants && stock.trim()) {
      const n = parseInt(stock.trim(), 10);
      if (Number.isNaN(n) || n < 0) {
        Alert.alert('Stock invalide', 'Le stock doit être un entier ≥ 0.');
        return;
      }
      stockNum = n;
    }

    try {
      if (isEditing && product) {
        await updateProduct({
          variables: {
            input: {
              id: product.id,
              name: name.trim(),
              sku: sku.trim() ? sku.trim() : undefined,
              description: description.trim()
                ? description.trim()
                : undefined,
              imageUrl: imageUrl.trim() ? imageUrl.trim() : undefined,
              priceCents,
              stock: stockNum,
              active,
            },
          },
        });
        Alert.alert('Produit mis à jour', 'Les modifications sont enregistrées.');
      } else {
        await createProduct({
          variables: {
            input: {
              name: name.trim(),
              sku: sku.trim() ? sku.trim() : undefined,
              description: description.trim()
                ? description.trim()
                : undefined,
              imageUrl: imageUrl.trim() ? imageUrl.trim() : undefined,
              priceCents,
              stock: stockNum,
              active,
            },
          },
        });
        Alert.alert('Produit créé', 'Le produit a été ajouté au catalogue.');
      }
      navigation.goBack();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sauvegarde impossible.';
      Alert.alert('Erreur', msg);
    }
  };

  if (isEditing && loading && !product) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="PRODUIT"
          title="Chargement…"
          compact
          showBack
        />
      </ScreenContainer>
    );
  }

  if (isEditing && !product) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="PRODUIT"
          title="Introuvable"
          compact
          showBack
        />
        <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <EmptyState
            icon="alert-circle-outline"
            title="Produit introuvable"
            description="Le produit n'existe plus ou n'est pas accessible."
          />
        </Card>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer keyboardAvoiding padding={0}>
      <ScreenHero
        eyebrow={isEditing ? 'ÉDITER PRODUIT' : 'NOUVEAU PRODUIT'}
        title={isEditing ? product?.name ?? '' : 'Catalogue'}
        compact
        showBack
      />

      <View style={styles.body}>
        <Card title="Identité">
          <View style={styles.fields}>
            <TextField
              label="Nom"
              value={name}
              onChangeText={setName}
              placeholder="Ex : Maillot officiel"
            />
            <TextField
              label="SKU (optionnel)"
              value={sku}
              onChangeText={setSku}
              placeholder="MAILLOT-2026"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TextField
              label="Image (URL)"
              value={imageUrl}
              onChangeText={setImageUrl}
              placeholder="https://…"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TextField
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="Présentation du produit"
              multiline
              numberOfLines={4}
            />
          </View>
        </Card>

        <Card title="Tarifs & stock">
          <View style={styles.fields}>
            <TextField
              label="Prix (€)"
              value={price}
              onChangeText={setPrice}
              placeholder="0,00"
              keyboardType="decimal-pad"
            />
            {hasVariants ? (
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyLabel}>Stock cumulé</Text>
                <Text style={styles.readOnlyValue}>
                  {product?.stock != null
                    ? `${product.stock} unité${product.stock > 1 ? 's' : ''}`
                    : 'Illimité'}
                </Text>
                <Text style={styles.readOnlyHint}>
                  Ce produit a des déclinaisons
                  {product && product.variantsBelowThreshold > 0
                    ? `, dont ${product.variantsBelowThreshold} sous son seuil de réapprovisionnement`
                    : ''}
                  . Leur stock se modifie depuis l’espace d’administration web.
                </Text>
              </View>
            ) : (
              <TextField
                label="Stock disponible (vide = illimité)"
                value={stock}
                onChangeText={setStock}
                placeholder="50"
                keyboardType="number-pad"
              />
            )}
          </View>
        </Card>

        <Card title="Disponibilité">
          <View style={styles.pillRow}>
            <Pill
              label="Actif"
              tone={active ? 'success' : 'neutral'}
              onPress={() => setActive(true)}
            />
            <Pill
              label="Inactif"
              tone={!active ? 'warning' : 'neutral'}
              onPress={() => setActive(false)}
            />
          </View>
        </Card>

        <Button
          label="Enregistrer"
          variant="primary"
          icon={isEditing ? 'save-outline' : 'checkmark-circle-outline'}
          onPress={() => void onSubmit()}
          loading={submitting}
          fullWidth
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  fields: {
    gap: spacing.md,
  },
  readOnly: {
    gap: spacing.xs,
  },
  readOnlyLabel: {
    ...typography.smallStrong,
    color: palette.muted,
  },
  readOnlyValue: {
    ...typography.body,
    color: palette.ink,
  },
  readOnlyHint: {
    ...typography.small,
    color: palette.muted,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});
