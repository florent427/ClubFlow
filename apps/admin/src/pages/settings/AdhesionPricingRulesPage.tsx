import { useMutation, useQuery } from '@apollo/client/react';
import React, { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CLUB_MEMBERSHIP_PRICING_RULES,
  CLUB_MEMBERSHIP_SETTINGS,
  CREATE_CLUB_MEMBERSHIP_PRICING_RULE,
  DELETE_CLUB_MEMBERSHIP_PRICING_RULE,
  MEMBERSHIP_PRODUCTS,
  UPDATE_CLUB_MEMBERSHIP_PRICING_RULE,
  UPDATE_CLUB_MEMBERSHIP_SETTINGS,
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
  const { data: settingsData, refetch: refetchSettings } = useQuery<{
    clubMembershipSettings: { fullPriceFirstMonths: number };
  }>(CLUB_MEMBERSHIP_SETTINGS, { fetchPolicy: 'cache-and-network' });

  const rules = rulesData?.clubMembershipPricingRules ?? [];
  const products = productsData?.membershipProducts ?? [];
  const fullPriceFirstMonths =
    settingsData?.clubMembershipSettings?.fullPriceFirstMonths ?? 3;

  const [createMut] = useMutation(CREATE_CLUB_MEMBERSHIP_PRICING_RULE);
  const [updateMut] = useMutation(UPDATE_CLUB_MEMBERSHIP_PRICING_RULE);
  const [deleteMut] = useMutation(DELETE_CLUB_MEMBERSHIP_PRICING_RULE);
  const [updateSettings] = useMutation(UPDATE_CLUB_MEMBERSHIP_SETTINGS);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<MembershipPricingRule | null>(null);
  const [confirmDelete, setConfirmDelete] =
    useState<MembershipPricingRule | null>(null);

  // État local pour le seuil "X premiers mois plein tarif"
  const [seuilDraft, setSeuilDraft] = useState<number | null>(null);
  const seuilValue = seuilDraft ?? fullPriceFirstMonths;
  const seuilDirty = seuilDraft !== null && seuilDraft !== fullPriceFirstMonths;

  async function saveSeuil() {
    if (seuilDraft === null) return;
    try {
      await updateSettings({
        variables: { fullPriceFirstMonths: seuilDraft },
      });
      showToast('Seuil enregistré', 'success');
      await refetchSettings();
      setSeuilDraft(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

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

      {/* Réglage global du club : seuil de plein tarif */}
      <section className="members-panel" style={{ marginBottom: 16 }}>
        <h2 className="members-panel__h">Réglage global — prorata</h2>
        <p className="cf-muted" style={{ fontSize: '0.85rem' }}>
          Combien de mois après le début de la saison facture-t-on le{' '}
          <strong>tarif annuel complet</strong> avant que le prorata ne
          commence à s&apos;appliquer ?
        </p>
        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            marginTop: 8,
          }}
        >
          <label className="cf-field cf-field--inline" style={{ margin: 0 }}>
            <span>Mois plein tarif au début de la saison</span>
            <input
              type="number"
              value={seuilValue}
              onChange={(e) => setSeuilDraft(Number(e.target.value) || 0)}
              min={0}
              max={12}
              style={{ width: 80 }}
            />
          </label>
          {seuilDirty ? (
            <button
              type="button"
              className="btn-primary btn-primary--sm"
              onClick={() => void saveSeuil()}
            >
              Enregistrer
            </button>
          ) : null}
          {seuilDirty ? (
            <button
              type="button"
              className="btn-ghost btn-ghost--sm"
              onClick={() => setSeuilDraft(null)}
            >
              Annuler
            </button>
          ) : null}
        </div>
        <p
          className="cf-muted"
          style={{ marginTop: 8, fontSize: '0.8rem' }}
        >
          {seuilValue === 0 ? (
            <>
              ⚠️ <strong>Pas de plein tarif initial</strong> — le prorata
              s&apos;applique dès le 1<sup>er</sup> mois de la saison
              (ancien comportement).
            </>
          ) : (
            <>
              💡 Les <strong>{seuilValue} premiers mois</strong> de la
              saison sont facturés au <strong>tarif annuel complet</strong>{' '}
              (pas de remise prorata). À partir du mois {seuilValue + 1},
              le prorata classique s&apos;applique.
            </>
          )}
        </p>
      </section>

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
        primaryProductIds: [],
        secondaryProductId: '',
        discountForAnnual: { type: 'FIXED_CENTS', value: -2000 },
        discountForMonthly: { type: 'FIXED_CENTS', value: -200 },
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
      <div
        style={{
          padding: 10,
          marginBottom: 12,
          background: 'rgba(59, 130, 246, 0.06)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          borderRadius: 6,
          fontSize: '0.82rem',
        }}
      >
        <strong>📚 Comment ça marche pour les inscriptions étalées dans le temps ?</strong>
        <p style={{ margin: '6px 0 0' }}>
          Le rang d&apos;un adhérent est calculé sur l&apos;<strong>ensemble des cotisations
          déjà facturées au foyer pour la saison courante</strong>, pas seulement
          sur le projet d&apos;adhésion en cours.
        </p>
        <p style={{ margin: '6px 0 0' }}>
          <em>Exemple :</em> Joseph et Léa s&apos;inscrivent en septembre.
          Tom est ajouté en janvier dans un nouveau projet → Tom est
          comptabilisé comme <strong>3<sup>ème</sup> adhérent du foyer</strong>{' '}
          (et non pas comme &quot;1<sup>er</sup>&quot; de son projet) →
          il bénéficie de la remise du tier 3.
        </p>
        <p style={{ margin: '6px 0 0', fontStyle: 'italic' }}>
          Les factures déjà émises ne sont jamais modifiées rétroactivement
          — pour rééquilibrer, créez un avoir manuel sur l&apos;ancienne facture.
        </p>
      </div>
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
  // Helper pour afficher la valeur d'une remise dans l'input (positive
  // pour l'utilisateur, le signe est appliqué au save).
  function pctOrEuro(d: { type: 'PERCENT_BP' | 'FIXED_CENTS'; value: number }) {
    return Math.abs(d.value / 100);
  }

  const primaryProducts = products.filter((p) =>
    config.primaryProductIds.includes(p.id),
  );
  const secondaryProduct = products.find(
    (p) => p.id === config.secondaryProductId,
  );

  function togglePrimary(productId: string) {
    const has = config.primaryProductIds.includes(productId);
    const next = has
      ? config.primaryProductIds.filter((id) => id !== productId)
      : [...config.primaryProductIds, productId];
    onChange({ ...config, primaryProductIds: next });
  }

  return (
    <fieldset className="cf-fieldset">
      <legend>Combinaison de produits</legend>
      <p className="cf-muted" style={{ marginBottom: 12, fontSize: '0.85rem' }}>
        Si l&apos;adhérent souscrit à <strong>au moins un</strong> des
        <strong> produits primaires</strong> (déclencheurs, sémantique OR),
        il bénéficie d&apos;une remise sur le <strong>produit secondaire</strong>.
        Les primaires peuvent avoir été achetés dans un projet précédent
        de la même saison.
      </p>

      {/* Produits primaires (multi-select) */}
      <fieldset
        className="cf-fieldset"
        style={{ marginBottom: 8, padding: 10 }}
      >
        <legend style={{ fontSize: '0.85rem', fontWeight: 600 }}>
          🎯 Produits <strong>primaires</strong> (au moins un déclenche)
          {config.primaryProductIds.length > 0
            ? ` — ${config.primaryProductIds.length} sélectionné${
                config.primaryProductIds.length > 1 ? 's' : ''
              }`
            : ''}
        </legend>
        {products.length === 0 ? (
          <p className="cf-muted">
            Aucune formule disponible. Crée d&apos;abord des formules
            d&apos;adhésion.
          </p>
        ) : (
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {products
              .filter((p) => p.id !== config.secondaryProductId)
              .map((p) => {
                const checked = config.primaryProductIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      marginBottom: 4,
                      border: checked
                        ? '2px solid #2563eb'
                        : '1px solid #e5e7eb',
                      borderRadius: 4,
                      cursor: 'pointer',
                      background: checked
                        ? 'rgba(37, 99, 235, 0.05)'
                        : 'white',
                      fontSize: '0.85rem',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePrimary(p.id)}
                    />
                    <span style={{ flex: 1 }}>
                      {p.label} ({formatEuros(p.annualAmountCents)} / an)
                    </span>
                  </label>
                );
              })}
          </div>
        )}
      </fieldset>

      {/* Produit secondaire */}
      <label className="cf-field">
        <span>
          💰 Produit <strong>secondaire</strong> (reçoit la remise)
        </span>
        <select
          value={config.secondaryProductId}
          onChange={(e) =>
            onChange({ ...config, secondaryProductId: e.target.value })
          }
        >
          <option value="" disabled>
            — Choisir le produit secondaire —
          </option>
          {products.map((p) => (
            <option
              key={p.id}
              value={p.id}
              disabled={config.primaryProductIds.includes(p.id)}
            >
              {p.label} ({formatEuros(p.annualAmountCents)} / an)
            </option>
          ))}
        </select>
      </label>

      {/* Remises annuel + mensuel séparées */}
      <fieldset
        className="cf-fieldset"
        style={{ marginTop: 12, padding: 10 }}
      >
        <legend style={{ fontSize: '0.85rem', fontWeight: 600 }}>
          📅 Remise sur le secondaire (annuel)
        </legend>
        <div className="cf-form-row" style={{ display: 'flex', gap: 12 }}>
          <label className="cf-field">
            <span>Type</span>
            <select
              value={config.discountForAnnual.type}
              onChange={(e) =>
                onChange({
                  ...config,
                  discountForAnnual: {
                    ...config.discountForAnnual,
                    type: e.target.value as 'PERCENT_BP' | 'FIXED_CENTS',
                  },
                })
              }
            >
              <option value="FIXED_CENTS">Montant fixe (€)</option>
              <option value="PERCENT_BP">Pourcentage (%)</option>
            </select>
          </label>
          <label className="cf-field">
            <span>
              {config.discountForAnnual.type === 'PERCENT_BP'
                ? 'Pourcentage (positif)'
                : 'Montant en € (positif)'}
            </span>
            <input
              type="number"
              value={pctOrEuro(config.discountForAnnual)}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                onChange({
                  ...config,
                  discountForAnnual: {
                    ...config.discountForAnnual,
                    value: -Math.abs(v) * 100,
                  },
                });
              }}
              min={0}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="cf-fieldset" style={{ padding: 10 }}>
        <legend style={{ fontSize: '0.85rem', fontWeight: 600 }}>
          🗓️ Remise sur le secondaire (mensuel)
        </legend>
        <div className="cf-form-row" style={{ display: 'flex', gap: 12 }}>
          <label className="cf-field">
            <span>Type</span>
            <select
              value={config.discountForMonthly.type}
              onChange={(e) =>
                onChange({
                  ...config,
                  discountForMonthly: {
                    ...config.discountForMonthly,
                    type: e.target.value as 'PERCENT_BP' | 'FIXED_CENTS',
                  },
                })
              }
            >
              <option value="FIXED_CENTS">Montant fixe (€/mois)</option>
              <option value="PERCENT_BP">Pourcentage (%)</option>
            </select>
          </label>
          <label className="cf-field">
            <span>
              {config.discountForMonthly.type === 'PERCENT_BP'
                ? 'Pourcentage (positif)'
                : 'Montant en € / mois (positif)'}
            </span>
            <input
              type="number"
              value={pctOrEuro(config.discountForMonthly)}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                onChange({
                  ...config,
                  discountForMonthly: {
                    ...config.discountForMonthly,
                    value: -Math.abs(v) * 100,
                  },
                });
              }}
              min={0}
            />
          </label>
        </div>
      </fieldset>

      {/* Preview */}
      {primaryProducts.length > 0 && secondaryProduct ? (
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
          <p style={{ margin: '8px 0', fontSize: '0.85rem' }}>
            Si un adhérent souscrit à{' '}
            <strong>{primaryProducts.map((p) => p.label).join(' OU ')}</strong>{' '}
            (peu importe l&apos;ordre / projet d&apos;achat dans la saison),
            la remise suivante s&apos;applique à{' '}
            <strong>{secondaryProduct.label}</strong> :
          </p>
          <ul
            style={{
              margin: '8px 0 0',
              paddingLeft: 20,
              fontSize: '0.85rem',
            }}
          >
            <li>
              Si <strong>annuel</strong> : remise de{' '}
              <strong style={{ color: '#dc2626' }}>
                {config.discountForAnnual.type === 'PERCENT_BP'
                  ? `-${pctOrEuro(config.discountForAnnual)}%`
                  : `${formatEuros(config.discountForAnnual.value)}`}
              </strong>{' '}
              sur le tarif annuel
            </li>
            <li>
              Si <strong>mensuel</strong> : remise de{' '}
              <strong style={{ color: '#dc2626' }}>
                {config.discountForMonthly.type === 'PERCENT_BP'
                  ? `-${pctOrEuro(config.discountForMonthly)}%`
                  : `${formatEuros(config.discountForMonthly.value)}/mois`}
              </strong>{' '}
              sur le tarif mensuel
            </li>
          </ul>
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
