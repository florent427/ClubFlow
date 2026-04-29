import { useMutation, useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ConfirmSheet,
  DataTable,
  ScreenContainer,
  ScreenHero,
  palette,
  spacing,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';
import {
  CLUB_MEMBERSHIP_PRICING_RULES,
  DELETE_MEMBERSHIP_PRICING_RULE,
} from '../../lib/documents/settings';

type Pattern =
  | 'FAMILY_PROGRESSIVE'
  | 'PRODUCT_BUNDLE'
  | 'AGE_RANGE_DISCOUNT'
  | 'NEW_MEMBER_DISCOUNT'
  | 'LOYALTY_DISCOUNT';

type Rule = {
  id: string;
  pattern: Pattern;
  label: string;
  isActive: boolean;
  priority: number;
  configJson: string;
};

type Data = { clubMembershipPricingRules: Rule[] };

const PATTERN_LABELS: Record<Pattern, string> = {
  FAMILY_PROGRESSIVE: 'Famille progressive',
  PRODUCT_BUNDLE: 'Bundle produits',
  AGE_RANGE_DISCOUNT: "Tranche d'âge",
  NEW_MEMBER_DISCOUNT: 'Nouveau membre',
  LOYALTY_DISCOUNT: 'Fidélité',
};

export function AdhesionPricingRulesScreen() {
  const { data, loading, refetch } = useQuery<Data>(
    CLUB_MEMBERSHIP_PRICING_RULES,
    { errorPolicy: 'all' },
  );

  const [confirmDelete, setConfirmDelete] = useState<Rule | null>(null);

  const [deleteRule, deleteState] = useMutation(
    DELETE_MEMBERSHIP_PRICING_RULE,
    { refetchQueries: [{ query: CLUB_MEMBERSHIP_PRICING_RULES }] },
  );

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.clubMembershipPricingRules ?? [];
    const sorted = [...list].sort((a, b) => a.priority - b.priority);
    return sorted.map((r) => ({
      key: r.id,
      title: r.label,
      subtitle: PATTERN_LABELS[r.pattern] ?? r.pattern,
      badge: r.isActive
        ? { label: 'Active', color: palette.successText, bg: palette.successBg }
        : { label: 'Inactive', color: palette.muted, bg: palette.bgAlt },
    }));
  }, [data]);

  const ruleById = (id: string) =>
    data?.clubMembershipPricingRules?.find((r) => r.id === id) ?? null;

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="TARIFS"
        title="Règles d'adhésion"
        subtitle="Remises automatiques"
        showBack
        compact
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Aucune règle"
        emptySubtitle="Configurez vos remises automatiques depuis l'admin web."
        emptyIcon="pricetag-outline"
        onLongPressRow={(id) => {
          const r = ruleById(id);
          if (r) setConfirmDelete(r);
        }}
      />
      <Pressable
        onPress={() => {
          Alert.alert(
            'Création de règle',
            "La création d'une règle de tarification (avec configuration JSON détaillée) est disponible sur l'admin web.",
          );
        }}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Nouvelle règle"
      >
        <Ionicons name="add" size={28} color={palette.surface} />
      </Pressable>

      <ConfirmSheet
        visible={!!confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) return;
          void deleteRule({ variables: { id: confirmDelete.id } }).finally(
            () => setConfirmDelete(null),
          );
        }}
        title="Supprimer cette règle ?"
        message={
          confirmDelete
            ? `« ${confirmDelete.label} » ne sera plus appliquée.`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        loading={deleteState.loading}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
