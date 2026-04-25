import { useMutation, useQuery } from '@apollo/client/react';
import React, { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CLUB_MEMBERSHIP_PRICING_RULES,
  CREATE_CLUB_MEMBERSHIP_PRICING_RULE,
  DELETE_CLUB_MEMBERSHIP_PRICING_RULE,
  MEMBERSHIP_PRODUCTS,
  UPDATE_CLUB_MEMBERSHIP_PRICING_RULE,
} from '../../lib/documents';
import type {
  ClubMembershipPricingRulesData,
  FamilyProgressiveConfig,
  MembershipPricingRule,
  MembershipPricingRulePatternGql,
  ProductBundleConfig,
} from '../../lib/types';

interface MembershipProductsListData {
  membershipProducts: Array<{
    id: string;
    label: string;
    annualAmountCents: number;
  }>;
}
import { useToast } from '../../components/ToastProvider';
import { ConfirmModal, Drawer } from '../../components/ui';

const PATTERN_LABELS: Record<MembershipPricingRulePatternGql, string> = {
  FAMILY_PROGRESSIVE: 'Famille progressive',
  PRODUCT_BUNDLE: 'Combinaison de produits',
  AGE_RANGE_DISCOUNT: 'Tranche d’âge',
  NEW_MEMBER_DISCOUNT: 'Nouvelle adhésion (v2)',
  LOYALTY_DISCOUNT: 'Fidélité (v2)',
};

const PATTERN_DESCRIPTIONS: Record<MembershipPricingRulePatternGql, string> = {
  FAMILY_PROGRESSIVE:
    'Remise progressive selon le rang du membre dans le foyer. Appliquée sur les cotisations uniquement (pas sur licence/dossier). Toujours sur les cotisations les moins chères — la plus chère reste plein tarif.',
  PRODUCT_BUNDLE:
    'Si plusieurs produits sont présents ensemble dans le projet d’adhésion, applique une remise sur l’un d’eux (ex Karaté + Cross Training = -20€ sur Cross Training).',
  AGE_RANGE_DISCOUNT:
    'Remise sur les adhérents dans une tranche d’âge donnée (ex moins de 12 ans = -15%).',
  NEW_MEMBER_DISCOUNT:
    'Remise pour les nouveaux adhérents (jamais inscrits avant cette saison). Disponible en v2.',
  LOYALTY_DISCOUNT:
    'Remise fidélité (X années consécutives d’adhésion). Disponible en v2.',
};

function formatEuros(cents: number): string {
  const v = (cents / 100).toFixed(2).replace('.', ',');
  return `${v} €`;
}

/**
 * Page admin pour gérer les règles de remise configurables. Chaque règle
 * a un `pattern` (FAMILY_PROGRESSIVE, PRODUCT_BUNDLE, ...) et un
 * formulaire dédié avec preview live sur des données exemple.
 */
export default function AdhesionPricingRulesPage() {
  const { showToast } = useToast();

  const { data: rulesData, refetch: refetchRules } =
    useQuery<ClubMembershipPricingRulesData>(CLUB_MEMBERSHIP_PRICING_RULES, {
      fetchPolicy: 'cache-and-network',
    });
  const { data: productsData } = useQuery<MembershipProductsListData>(
    MEMBERSHIP_PRODUCTS,
    { fetchPolicy: 'cache-and-network' },
  );

  const rules = rulesData?.clubMembershipPricingRules ?? [];
  const products = productsData?.membershipProducts ?? [];

  const [createMut] = useMutation(CREATE_CLUB_MEMBERSHIP_PRICING_RULE);
  const [updateMut] = useMutation(UPDATE_CLUB_MEMBERSHIP_PRICING_RULE);
  const [deleteMut] = useMutation(DELETE_CLUB_MEMBERSHIP_PRICING_RULE);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<MembershipPricingRule | null>(null);
  const [confirmDelete, setConfirmDelete] =
    useState<MembershipPricingRule | null>(null);

  function openCreate(pattern: MembershipPricingRulePatternGql) {
    setEditing({
      id: '',
      pattern,
      label: PATTERN_LABELS[pattern],
      isActive: true,
      priority: 0,
      configJson: JSON.stringify(defaultConfigFor(pattern)),
      createdAt: '',
      updatedAt: '',
    });
    setDrawerOpen(true);
  }

  function openEdit(rule: MembershipPricingRule) {
    setEditing(rule);
    setDrawerOpen(true);
  }

  async function doDelete(rule: MembershipPricingRule) {
    try {
      await deleteMut({ variables: { id: rule.id } });
      showToast('Règle supprimée', 'success');
      await refetchRules();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      setConfirmDelete(null);
    }
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <p className="members-loom__eyebrow">Paramètres → Adhésion</p>
        <h1 className="members-loom__title">Remises automatiques</h1>
        <p className="members-loom__lede">
          Configure les remises appliquées automatiquement aux factures
          d’adhésion. Plusieurs règles peuvent être actives en même
          temps — elles s’appliquent dans l’ordre de priorité
          croissant.
        </p>
      </header>

      <section className="members-panel" style={{ marginBottom: 16 }}>
        <h2 className="members-panel__h">Règles actives</h2>
        {rules.length === 0 ? (
          <p className="cf-muted">
            Aucune règle configurée. Crée-en une via les boutons ci-dessous.
          </p>
        ) : (
          <table className="cf-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Libellé</th>
                <th>Priorité</th>
                <th>Statut</th>
                <th style={{ width: 200 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} style={r.isActive ? {} : { opacity: 0.5 }}>
                  <td>
                    <span className="cf-pill cf-pill--muted">
                      {PATTERN_LABELS[r.pattern]}
                    </span>
                  </td>
                  <td>
                    <strong>{r.label}</strong>
                  </td>
                  <td>{r.priority}</td>
                  <td>
                    {r.isActive ? (
                      <span className="cf-pill cf-pill--ok">Active</span>
                    ) : (
                      <span className="cf-pill cf-pill--muted">Inactive</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-ghost btn-ghost--sm"
                      onClick={() => openEdit(r)}
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-ghost--danger btn-ghost--sm"
                      onClick={() => setConfirmDelete(r)}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="members-panel">
        <h2 className="members-panel__h">Ajouter une nouvelle règle</h2>
        <div className="settings-hub-cards">
          {(
            [
              'FAMILY_PROGRESSIVE',
              'PRODUCT_BUNDLE',
              'AGE_RANGE_DISCOUNT',
            ] as const
          ).map((p) => (
            <button
              key={p}
              type="button"
              className="settings-hub-card"
              onClick={() => openCreate(p)}
              style={{ textAlign: 'left', cursor: 'pointer' }}
            >
              <span className="settings-hub-card__title">
                + {PATTERN_LABELS[p]}
              </span>
              <span className="settings-hub-card__desc">
                {PATTERN_DESCRIPTIONS[p]}
              </span>
            </button>
          ))}
        </div>
      </section>

      <Drawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setEditing(null);
        }}
        title={
          editing && editing.id
            ? `Modifier — ${PATTERN_LABELS[editing.pattern]}`
            : editing
              ? `Nouvelle règle — ${PATTERN_LABELS[editing.pattern]}`
              : 'Règle'
        }
        footer={null}
      >
        {editing ? (
          <PricingRuleForm
            initial={editing}
            products={products.map((p) => ({
              id: p.id,
              label: p.label,
              annualAmountCents: p.annualAmountCents,
            }))}
            onCancel={() => {
              setDrawerOpen(false);
              setEditing(null);
            }}
            onSave={async (rule) => {
              try {
                if (editing.id) {
                  await updateMut({
                    variables: {
                      input: {
                        id: editing.id,
                        label: rule.label,
                        isActive: rule.isActive,
                        priority: rule.priority,
                        configJson: rule.configJson,
                      },
                    },
                  });
                  showToast('Règle mise à jour', 'success');
                } else {
                  await createMut({
                    variables: {
                      input: {
                        pattern: editing.pattern,
                        label: rule.label,
                        isActive: rule.isActive,
                        priority: rule.priority,
                        configJson: rule.configJson,
                      },
                    },
                  });
                  showToast('Règle créée', 'success');
                }
                setDrawerOpen(false);
                setEditing(null);
                await refetchRules();
              } catch (err) {
                showToast(
                  err instanceof Error ? err.message : 'Erreur',
                  'error',
                );
              }
            }}
          />
        ) : null}
      </Drawer>

      <ConfirmModal
        open={confirmDelete !== null}
        title="Supprimer cette règle ?"
        message={`La règle « ${
          confirmDelete?.label ?? ''
        } » sera supprimée définitivement. Les factures déjà émises avec cette règle ne sont pas affectées.`}
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && void doDelete(confirmDelete)}
      />
    </>
  );
}

// ============================================================================
// Form per pattern + preview live
// ============================================================================

function defaultConfigFor(
  pattern: MembershipPricingRulePatternGql,
): unknown {
  switch (pattern) {
    case 'FAMILY_PROGRESSIVE':
      return {
        tiers: [
          { rank: 2, type: 'PERCENT_BP', value: -1000 },
          { rank: 3, type: 'PERCENT_BP', value: -2000 },
          { rank: 4, type: 'PERCENT_BP', value: -3000 },
        ],
        appliesTo: ['SUBSCRIPTION'],
        sortBy: 'AMOUNT_DESC',
      } satisfies FamilyProgressiveConfig;
    case 'PRODUCT_BUNDLE':
      return {
        requiredProductIds: [],
        discountAppliesToProductId: '',
        discountType: 'FIXED_CENTS',
        discountValue: -2000,
      } satisfies ProductBundleConfig;
    case 'AGE_RANGE_DISCOUNT':
      return {
        minAge: null,
        maxAge: 12,
        discountType: 'PERCENT_BP',
        discountValue: -1500,
      };
    default:
      return {};
  }
}

interface PricingRuleFormProps {
  initial: MembershipPricingRule;
  products: Array<{ id: string; label: string; annualAmountCents: number }>;
  onCancel: () => void;
  onSave: (rule: {
    label: string;
    isActive: boolean;
    priority: number;
    configJson: string;
  }) => void;
}

function PricingRuleForm({
  initial,
  products,
  onCancel,
  onSave,
}: PricingRuleFormProps) {
  const [label, setLabel] = useState(initial.label);
  const [isActive, setIsActive] = useState(initial.isActive);
  const [priority, setPriority] = useState(initial.priority);
  // Le config est édité via un state typé par pattern.
  const [config, setConfig] = useState<unknown>(() => {
    try {
      return JSON.parse(initial.configJson);
    } catch {
      return defaultConfigFor(initial.pattern);
    }
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    onSave({
      label: label.trim(),
      isActive,
      priority,
      configJson: JSON.stringify(config),
    });
  }

  return (
    <form onSubmit={onSubmit} className="cf-form">
      <label className="cf-field">
        <span>Libellé *</span>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={100}
          required
        />
      </label>
      <div className="cf-form-row" style={{ display: 'flex', gap: 12 }}>
        <label className="cf-field cf-field--inline">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span>Active</span>
        </label>
        <label className="cf-field cf-field--inline">
          <span>Priorité</span>
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value) || 0)}
            min={0}
            max={999}
            style={{ width: 80 }}
          />
        </label>
      </div>

      {/* Form spécifique au pattern */}
      {initial.pattern === 'FAMILY_PROGRESSIVE' ? (
        <FamilyProgressiveForm
          config={config as FamilyProgressiveConfig}
          onChange={setConfig}
          products={products}
        />
      ) : null}
      {initial.pattern === 'PRODUCT_BUNDLE' ? (
        <ProductBundleForm
          config={config as ProductBundleConfig}
          onChange={setConfig}
          products={products}
        />
      ) : null}
      {initial.pattern === 'AGE_RANGE_DISCOUNT' ? (
        <AgeRangeForm
          config={config as { minAge: number | null; maxAge: number | null; discountType: 'PERCENT_BP' | 'FIXED_CENTS'; discountValue: number }}
          onChange={setConfig}
        />
      ) : null}

      <div className="cf-drawer-foot" style={{ marginTop: 16 }}>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="btn-primary">
          {initial.id ? 'Enregistrer' : 'Créer'}
        </button>
      </div>
    </form>
  );
}

// ============================================================================
// Sub-form FAMILY_PROGRESSIVE
// ============================================================================

function FamilyProgressiveForm({
  config,
  onChange,
  products,
}: {
  config: FamilyProgressiveConfig;
  onChange: (next: FamilyProgressiveConfig) => void;
  products: Array<{ id: string; label: string; annualAmountCents: number }>;
}) {
  function updateTier(rank: number, type: 'PERCENT_BP', percentRaw: string) {
    const pct = Number(percentRaw) || 0;
    const nextTiers = config.tiers.map((t) =>
      t.rank === rank
        ? { ...t, type, value: -Math.abs(pct) * 100 } // -10% = -1000 BP
        : t,
    );
    onChange({ ...config, tiers: nextTiers });
  }

  function pctOfTier(rank: number): string {
    const t = config.tiers.find((tt) => tt.rank === rank);
    if (!t) return '0';
    return String(Math.abs(t.value / 100));
  }

  // Preview live : Foyer Hoarau exemple si pas assez de produits
  const previewProducts =
    products.length >= 3
      ? products.slice(0, 4)
      : [
          { id: 'p1', label: 'Adhérent #1 (le + cher)', annualAmountCents: 15000 },
          { id: 'p2', label: 'Adhérent #2', annualAmountCents: 12000 },
          { id: 'p3', label: 'Adhérent #3', annualAmountCents: 9000 },
          { id: 'p4', label: 'Adhérent #4 et plus', annualAmountCents: 9000 },
        ];

  // Calcule preview deltas
  const sortedPreview = [...previewProducts].sort(
    (a, b) => b.annualAmountCents - a.annualAmountCents,
  );
  const previewLines = sortedPreview.map((p, idx) => {
    const rank = idx + 1;
    if (rank === 1) {
      return {
        ...p,
        rank,
        delta: 0,
        deltaPct: 0,
        finalCents: p.annualAmountCents,
      };
    }
    const tier =
      config.tiers.find((t) => t.rank === rank) ??
      config.tiers[config.tiers.length - 1];
    const pct = tier ? Math.abs(tier.value / 100) : 0;
    const delta = -Math.round((p.annualAmountCents * (tier?.value ?? 0)) / -10_000) * -1;
    return {
      ...p,
      rank,
      delta,
      deltaPct: pct,
      finalCents: p.annualAmountCents + delta,
    };
  });

  return (
    <fieldset className="cf-fieldset">
      <legend>Paliers de remise</legend>
      <p className="cf-muted" style={{ marginBottom: 12, fontSize: '0.85rem' }}>
        Le 1er adhérent du foyer paie plein tarif. Les suivants bénéficient
        des taux ci-dessous (sur les cotisations les moins chères).
      </p>
      <label className="cf-field">
        <span>2ᵉ adhérent : remise (%)</span>
        <input
          type="number"
          value={pctOfTier(2)}
          onChange={(e) => updateTier(2, 'PERCENT_BP', e.target.value)}
          min={0}
          max={100}
          style={{ width: 100 }}
        />
      </label>
      <label className="cf-field">
        <span>3ᵉ adhérent : remise (%)</span>
        <input
          type="number"
          value={pctOfTier(3)}
          onChange={(e) => updateTier(3, 'PERCENT_BP', e.target.value)}
          min={0}
          max={100}
          style={{ width: 100 }}
        />
      </label>
      <label className="cf-field">
        <span>4ᵉ adhérent et + : remise (%)</span>
        <input
          type="number"
          value={pctOfTier(4)}
          onChange={(e) => updateTier(4, 'PERCENT_BP', e.target.value)}
          min={0}
          max={100}
          style={{ width: 100 }}
        />
      </label>

      <div
        className="cf-alert cf-alert--info"
        style={{
          marginTop: 16,
          padding: 12,
          background: 'rgba(59, 130, 246, 0.08)',
          borderRadius: 6,
        }}
      >
        <strong>💡 Aperçu sur un foyer exemple :</strong>
        <table
          className="cf-table"
          style={{ marginTop: 8, fontSize: '0.85rem' }}
        >
          <thead>
            <tr>
              <th>Adhérent</th>
              <th style={{ textAlign: 'right' }}>Tarif base</th>
              <th>Remise</th>
              <th style={{ textAlign: 'right' }}>Final</th>
            </tr>
          </thead>
          <tbody>
            {previewLines.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.rank === 1 ? '🏆 ' : ''}
                  {p.label}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {formatEuros(p.annualAmountCents)}
                </td>
                <td>
                  {p.delta === 0 ? (
                    <small className="cf-muted">plein tarif</small>
                  ) : (
                    <span style={{ color: '#dc2626' }}>
                      -{p.deltaPct}% ({formatEuros(p.delta)})
                    </span>
                  )}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>
                  {formatEuros(p.finalCents)}
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid #cbd5e1' }}>
              <td colSpan={2}>
                <strong>Total foyer</strong>
              </td>
              <td style={{ color: '#dc2626' }}>
                {formatEuros(
                  previewLines.reduce((s, p) => s + p.delta, 0),
                )}
              </td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>
                {formatEuros(
                  previewLines.reduce((s, p) => s + p.finalCents, 0),
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </fieldset>
  );
}

// ============================================================================
// Sub-form PRODUCT_BUNDLE
// ============================================================================

function ProductBundleForm({
  config,
  onChange,
  products,
}: {
  config: ProductBundleConfig;
  onChange: (next: ProductBundleConfig) => void;
  products: Array<{ id: string; label: string; annualAmountCents: number }>;
}) {
  function toggleProduct(productId: string) {
    const next = config.requiredProductIds.includes(productId)
      ? config.requiredProductIds.filter((id) => id !== productId)
      : [...config.requiredProductIds, productId];
    onChange({
      ...config,
      requiredProductIds: next,
      // Reset cible si elle n'est plus dans la liste
      discountAppliesToProductId: next.includes(config.discountAppliesToProductId)
        ? config.discountAppliesToProductId
        : next[0] ?? '',
    });
  }

  return (
    <fieldset className="cf-fieldset">
      <legend>Combinaison de produits</legend>
      <p className="cf-muted" style={{ marginBottom: 12, fontSize: '0.85rem' }}>
        Si <strong>tous</strong> les produits cochés sont présents ensemble
        dans le projet d’adhésion, applique la remise sur le produit
        cible.
      </p>
      <fieldset className="cf-fieldset" style={{ marginBottom: 12 }}>
        <legend>Produits requis (au moins 2)</legend>
        {products.length === 0 ? (
          <p className="cf-muted">
            Aucune formule disponible. Crée d’abord des formules
            d’adhésion.
          </p>
        ) : (
          products.map((p) => (
            <label
              key={p.id}
              className="cf-field cf-field--inline"
              style={{ display: 'block', padding: 4 }}
            >
              <input
                type="checkbox"
                checked={config.requiredProductIds.includes(p.id)}
                onChange={() => toggleProduct(p.id)}
              />
              <span style={{ marginLeft: 6 }}>
                {p.label} ({formatEuros(p.annualAmountCents)} / an)
              </span>
            </label>
          ))
        )}
      </fieldset>
      <label className="cf-field">
        <span>Remise appliquée sur</span>
        <select
          value={config.discountAppliesToProductId}
          onChange={(e) =>
            onChange({
              ...config,
              discountAppliesToProductId: e.target.value,
            })
          }
        >
          <option value="" disabled>
            — Choisir le produit cible —
          </option>
          {config.requiredProductIds.map((id) => {
            const p = products.find((pp) => pp.id === id);
            return (
              <option key={id} value={id}>
                {p?.label ?? id}
              </option>
            );
          })}
        </select>
      </label>
      <div className="cf-form-row" style={{ display: 'flex', gap: 12 }}>
        <label className="cf-field">
          <span>Type</span>
          <select
            value={config.discountType}
            onChange={(e) =>
              onChange({
                ...config,
                discountType: e.target.value as 'PERCENT_BP' | 'FIXED_CENTS',
              })
            }
          >
            <option value="FIXED_CENTS">Montant fixe (€)</option>
            <option value="PERCENT_BP">Pourcentage (%)</option>
          </select>
        </label>
        <label className="cf-field">
          <span>
            {config.discountType === 'PERCENT_BP'
              ? 'Pourcentage (positif)'
              : 'Montant en € (positif)'}
          </span>
          <input
            type="number"
            value={Math.abs(config.discountValue / 100)}
            onChange={(e) => {
              const v = Number(e.target.value) || 0;
              onChange({
                ...config,
                discountValue:
                  -Math.abs(v) * (config.discountType === 'PERCENT_BP' ? 100 : 100),
              });
            }}
            min={0}
          />
        </label>
      </div>

      {config.requiredProductIds.length >= 2 &&
      config.discountAppliesToProductId ? (
        <div
          className="cf-alert cf-alert--info"
          style={{
            marginTop: 12,
            padding: 12,
            background: 'rgba(59, 130, 246, 0.08)',
            borderRadius: 6,
          }}
        >
          <strong>💡 Aperçu :</strong>
          <p style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>
            Si un membre s’inscrit à{' '}
            {config.requiredProductIds
              .map((id) => products.find((p) => p.id === id)?.label ?? id)
              .join(' + ')}
            , il bénéficie de{' '}
            <strong style={{ color: '#dc2626' }}>
              {config.discountType === 'PERCENT_BP'
                ? `-${Math.abs(config.discountValue / 100)}%`
                : `${formatEuros(config.discountValue)}`}
            </strong>{' '}
            sur{' '}
            <strong>
              {products.find(
                (p) => p.id === config.discountAppliesToProductId,
              )?.label ?? '—'}
            </strong>
            .
          </p>
        </div>
      ) : null}
    </fieldset>
  );
}

// ============================================================================
// Sub-form AGE_RANGE_DISCOUNT
// ============================================================================

function AgeRangeForm({
  config,
  onChange,
}: {
  config: {
    minAge: number | null;
    maxAge: number | null;
    discountType: 'PERCENT_BP' | 'FIXED_CENTS';
    discountValue: number;
  };
  onChange: (next: typeof config) => void;
}) {
  return (
    <fieldset className="cf-fieldset">
      <legend>Tranche d’âge</legend>
      <div className="cf-form-row" style={{ display: 'flex', gap: 12 }}>
        <label className="cf-field">
          <span>Âge min (laisser vide = pas de borne)</span>
          <input
            type="number"
            value={config.minAge ?? ''}
            onChange={(e) =>
              onChange({
                ...config,
                minAge: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            min={0}
            max={120}
          />
        </label>
        <label className="cf-field">
          <span>Âge max (laisser vide = pas de borne)</span>
          <input
            type="number"
            value={config.maxAge ?? ''}
            onChange={(e) =>
              onChange({
                ...config,
                maxAge: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            min={0}
            max={120}
          />
        </label>
      </div>
      <div className="cf-form-row" style={{ display: 'flex', gap: 12 }}>
        <label className="cf-field">
          <span>Type</span>
          <select
            value={config.discountType}
            onChange={(e) =>
              onChange({
                ...config,
                discountType: e.target.value as 'PERCENT_BP' | 'FIXED_CENTS',
              })
            }
          >
            <option value="PERCENT_BP">Pourcentage (%)</option>
            <option value="FIXED_CENTS">Montant fixe (€)</option>
          </select>
        </label>
        <label className="cf-field">
          <span>Valeur (positive)</span>
          <input
            type="number"
            value={Math.abs(config.discountValue / 100)}
            onChange={(e) => {
              const v = Number(e.target.value) || 0;
              onChange({
                ...config,
                discountValue: -Math.abs(v) * 100,
              });
            }}
            min={0}
          />
        </label>
      </div>
    </fieldset>
  );
}
