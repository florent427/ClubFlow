import { useMutation, useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  BottomActionBar,
  ConfirmSheet,
  DataTable,
  ScreenContainer,
  ScreenHero,
  SearchBar,
  formatEuroCents,
  palette,
  spacing,
  useDebounced,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import {
  DELETE_SHOP_PRODUCT,
  SHOP_PRODUCTS,
} from '../../lib/documents/shop';

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

type Data = { shopProducts: Product[] };

export function ShopProductsScreen() {
  const nav = useNavigation();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 200);
  const [actionTargetId, setActionTargetId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data, loading, refetch } = useQuery<Data>(SHOP_PRODUCTS, {
    errorPolicy: 'all',
  });
  const [deleteProduct, { loading: deleting }] = useMutation(
    DELETE_SHOP_PRODUCT,
  );

  const products = data?.shopProducts ?? [];
  const target = products.find((p) => p.id === actionTargetId) ?? null;

  const rows = useMemo<DataTableRow[]>(() => {
    const q = debounced.trim().toLowerCase();
    return products
      .filter((p) => {
        if (q.length === 0) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          (p.sku?.toLowerCase().includes(q) ?? false)
        );
      })
      .map((p) => ({
        key: p.id,
        title: `${p.name} · ${formatEuroCents(p.priceCents)}`,
        subtitle:
          p.stock != null
            ? `Stock : ${p.stock}${p.sku ? ` · SKU ${p.sku}` : ''}`
            : p.sku
              ? `SKU ${p.sku}`
              : 'Stock illimité',
        badge: !p.active
          ? { label: 'Inactif', color: palette.muted, bg: palette.bgAlt }
          : null,
      }));
  }, [products, debounced]);

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await deleteProduct({ variables: { id: confirmDeleteId } });
      setConfirmDeleteId(null);
      await refetch();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Suppression impossible');
    }
  };

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="BOUTIQUE"
        title="Produits"
        subtitle={`${products.length} référence${products.length > 1 ? 's' : ''}`}
        compact
      />
      <View style={styles.searchBar}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher un produit…"
        />
      </View>
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Catalogue vide"
        emptySubtitle="Ajoutez votre premier produit."
        emptyIcon="storefront-outline"
        onPressRow={(id) =>
          (nav as any).navigate('ShopProductEditor', { productId: id })
        }
        onLongPressRow={(id) => setActionTargetId(id)}
      />
      <Pressable
        onPress={() => (nav as any).navigate('ShopProductEditor')}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Nouveau produit"
      >
        <Ionicons name="add" size={28} color={palette.surface} />
      </Pressable>

      <BottomActionBar
        visible={actionTargetId != null}
        onClose={() => setActionTargetId(null)}
        title={target?.name}
        actions={[
          {
            key: 'delete',
            label: 'Supprimer',
            icon: 'trash-outline',
            tone: 'danger',
          },
        ]}
        onAction={(key) => {
          const id = actionTargetId;
          setActionTargetId(null);
          if (!id) return;
          if (key === 'delete') setConfirmDeleteId(id);
        }}
      />
      <ConfirmSheet
        visible={confirmDeleteId != null}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={handleDelete}
        title="Supprimer le produit ?"
        message="Cette action est irréversible."
        confirmLabel="Supprimer"
        destructive
        loading={deleting}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
