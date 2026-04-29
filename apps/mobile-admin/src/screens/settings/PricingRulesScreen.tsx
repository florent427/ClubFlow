import { useMutation, useQuery } from '@apollo/client/react';
import {
  ConfirmSheet,
  DataTable,
  ScreenContainer,
  ScreenHero,
  palette,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useMemo, useState } from 'react';
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
  AGE_RANGE_DISCOUNT: 'Tranche d\'âge',
  NEW_MEMBER_DISCOUNT: 'Nouveau membre',
  LOYALTY_DISCOUNT: 'Fidélité',
};

/**
 * Tente d'extraire un pourcentage de remise lisible depuis configJson.
 * Selon le pattern, la structure varie (tiers[0], discountBp, etc.) — on
 * fait un best-effort pour afficher quelque chose d'utile, sinon on
 * tombe sur le label du pattern.
 */
function extractDiscountSummary(rule: Rule): string {
  try {
    const cfg = JSON.parse(rule.configJson) as Record<string, unknown>;

    // FAMILY_PROGRESSIVE → tiers[].value (en BP si type=PERCENT_BP)
    if (Array.isArray(cfg.tiers)) {
      const t = cfg.tiers as Array<{
        type?: string;
        value?: number;
      }>;
      const percents = t
        .filter((x) => x.type === 'PERCENT_BP' && typeof x.value === 'number')
        .map((x) => `${(x.value as number) / 100}%`);
      if (percents.length > 0) return percents.join(' / ');
    }
    // Cas générique : champ discountBp / discountPercent
    if (typeof cfg.discountBp === 'number') {
      return `${cfg.discountBp / 100}%`;
    }
    if (typeof cfg.discountPercent === 'number') {
      return `${cfg.discountPercent}%`;
    }
  } catch {
    // ignore
  }
  return PATTERN_LABELS[rule.pattern];
}

export function PricingRulesScreen() {
  const { data, loading, refetch } = useQuery<Data>(
    CLUB_MEMBERSHIP_PRICING_RULES,
    { errorPolicy: 'all' },
  );

  const [confirmDelete, setConfirmDelete] = useState<Rule | null>(null);

  const [deleteRule, deleteState] = useMutation(
    DELETE_MEMBERSHIP_PRICING_RULE,
    {
      refetchQueries: [{ query: CLUB_MEMBERSHIP_PRICING_RULES }],
    },
  );

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.clubMembershipPricingRules ?? [];
    const sorted = [...list].sort((a, b) => a.priority - b.priority);
    return sorted.map((r) => ({
      key: r.id,
      title: r.label,
      subtitle: PATTERN_LABELS[r.pattern] ?? r.pattern,
      badge: r.isActive
        ? {
            label: extractDiscountSummary(r),
            color: palette.successText,
            bg: palette.successBg,
          }
        : { label: 'Inactif', color: palette.muted, bg: palette.bgAlt },
    }));
  }, [data]);

  const ruleById = (id: string) =>
    data?.clubMembershipPricingRules?.find((r) => r.id === id) ?? null;

  return (
    <ScreenContainer padding={0}>
      <ScreenHero
        eyebrow="RÉGLAGES"
        title="Tarifs"
        subtitle="Règles de remise"
        showBack
        compact
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Aucune règle"
        emptySubtitle="Configurez vos remises automatiques."
        emptyIcon="pricetag-outline"
        onLongPressRow={(id) => {
          const r = ruleById(id);
          if (r) setConfirmDelete(r);
        }}
      />

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
