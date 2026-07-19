import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ADJUST_SHOP_VARIANT_STOCK,
  CANCEL_SHOP_ORDER,
  CREATE_SHOP_PRODUCT,
  DELETE_SHOP_PRODUCT,
  GENERATE_SHOP_PRODUCT_VARIANTS,
  MARK_SHOP_ORDER_PAID,
  RESTOCK_SHOP_VARIANT,
  SET_SHOP_PRODUCT_OPTIONS,
  SHOP_LOW_STOCK_VARIANTS,
  SHOP_ORDERS,
  SHOP_PRODUCT_OPTIONS,
  SHOP_PRODUCTS,
  SHOP_STOCK_MOVEMENTS,
  TRIGGER_SHOP_STOCK_SWEEP,
  UPDATE_SHOP_PRODUCT,
  UPDATE_SHOP_PRODUCT_VARIANT,
} from '../../lib/documents';
import type {
  AdjustShopVariantStockMutationData,
  CreateShopProductMutationData,
  GenerateShopProductVariantsMutationData,
  RestockShopVariantMutationData,
  SetShopProductOptionsMutationData,
  ShopLowStockVariant,
  ShopLowStockVariantsQueryData,
  ShopOrder,
  ShopOrdersQueryData,
  ShopProduct,
  ShopProductOptionsQueryData,
  ShopProductsQueryData,
  ShopStockMovementKindGql,
  ShopStockMovementsQueryData,
  TriggerShopStockSweepMutationData,
  UpdateShopProductMutationData,
  UpdateShopProductVariantMutationData,
} from '../../lib/types';
import {
  parseOptionalInt,
  planMatrixSave,
  seedRow,
} from '../../lib/shop-variant-matrix';
import type { MatrixRowDraft } from '../../lib/shop-variant-matrix';
import { useToast } from '../../components/ToastProvider';
import { ConfirmModal, Drawer, EmptyState } from '../../components/ui';

function fmtEuros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}
function orderStatusPill(s: ShopOrder['status']): {
  label: string;
  cls: 'ok' | 'warn' | 'muted';
} {
  if (s === 'PAID') return { label: 'Payée', cls: 'ok' };
  if (s === 'CANCELLED') return { label: 'Annulée', cls: 'muted' };
  return { label: 'En attente', cls: 'warn' };
}

/** « Produit — L / Rouge », ou le seul nom du produit si pas de déclinaison. */
function variantDisplay(productName: string, label: string | null): string {
  return label ? `${productName} — ${label}` : productName;
}

const MOVEMENT_LABELS: Record<ShopStockMovementKindGql, string> = {
  RESTOCK: 'Réception',
  RESERVE: 'Réservation',
  RELEASE: 'Retour (commande annulée)',
  FULFILL: 'Sortie (commande payée)',
  ADJUSTMENT: 'Correction d’inventaire',
  SHRINKAGE: 'Perte / casse / vol',
};

/** Delta signé, « — » quand le compteur n'a pas bougé. */
function fmtDelta(n: number): string {
  if (n === 0) return '—';
  return n > 0 ? `+${n}` : String(n);
}

// ===========================================================================
// Sous-écran des déclinaisons
//
// N'est JAMAIS ouvert pour un produit simple : la bascule qui y mène est
// décochée par défaut, et un trésorier qui vend un porte-clés ne verra donc
// jamais le mot « déclinaison » (ADR-0012 §1).
// ===========================================================================

type AxisDraft = { name: string; valuesText: string };

function VariantsDrawer({
  initialProduct,
  onClose,
}: {
  initialProduct: ShopProduct;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [product, setProduct] = useState<ShopProduct>(initialProduct);

  const { data: optData } = useQuery<ShopProductOptionsQueryData>(
    SHOP_PRODUCT_OPTIONS,
    {
      variables: { productId: initialProduct.id },
      fetchPolicy: 'cache-and-network',
    },
  );

  const [setOptions, { loading: settingOptions }] =
    useMutation<SetShopProductOptionsMutationData>(SET_SHOP_PRODUCT_OPTIONS);
  const [generate, { loading: generating }] =
    useMutation<GenerateShopProductVariantsMutationData>(
      GENERATE_SHOP_PRODUCT_VARIANTS,
    );
  const [updateVariant] = useMutation<UpdateShopProductVariantMutationData>(
    UPDATE_SHOP_PRODUCT_VARIANT,
  );
  const [adjustStock] = useMutation<AdjustShopVariantStockMutationData>(
    ADJUST_SHOP_VARIANT_STOCK,
  );

  const [axes, setAxes] = useState<AxisDraft[] | null>(null);
  const [savingMatrix, setSavingMatrix] = useState(false);

  // Semé UNE FOIS : un refetch en arrière-plan ne doit pas effacer les axes
  // que l'admin est en train de saisir.
  useEffect(() => {
    if (!optData) return;
    setAxes((prev) => {
      if (prev !== null) return prev;
      const rows = optData.shopProductOptions.map((o) => ({
        name: o.name,
        valuesText: o.values.map((v) => v.value).join(', '),
      }));
      return rows.length > 0 ? rows : [{ name: '', valuesText: '' }];
    });
  }, [optData]);

  /** La matrice, c'est tout sauf la déclinaison par défaut — jamais montrée. */
  const matrix = useMemo(
    () => product.variants.filter((v) => !v.isDefault),
    [product],
  );

  const [rows, setRows] = useState<Record<string, MatrixRowDraft>>({});
  const [tracked, setTracked] = useState(true);

  // Re-semé à chaque nouvelle version du produit, donc après chaque écriture :
  // ce que l'écran affiche est toujours ce que la base contient.
  useEffect(() => {
    const next: Record<string, MatrixRowDraft> = {};
    for (const v of matrix) next[v.id] = seedRow(v);
    setRows(next);
    setTracked(matrix.length === 0 ? true : matrix.some((v) => v.trackStock));
  }, [matrix]);

  function patchRow(id: string, patch: Partial<MatrixRowDraft>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function onSaveAxes() {
    if (!axes) return;
    const cleaned = axes
      .map((a) => ({
        name: a.name.trim(),
        values: Array.from(
          new Set(
            a.valuesText
              .split(',')
              .map((v) => v.trim())
              .filter((v) => v.length > 0),
          ),
        ),
      }))
      .filter((a) => a.name !== '' || a.values.length > 0);

    if (cleaned.length === 0) {
      showToast(
        'Nommez au moins un axe, ou décochez « Ce produit a des déclinaisons » sur la fiche produit.',
        'error',
      );
      return;
    }
    for (const axis of cleaned) {
      if (axis.name === '') {
        showToast('Chaque axe doit être nommé.', 'error');
        return;
      }
      if (axis.values.length === 0) {
        showToast(`L’axe « ${axis.name} » doit proposer au moins une valeur.`, 'error');
        return;
      }
    }

    try {
      // Deux appels, dans cet ordre : le premier définit les axes et désactive
      // les combinaisons devenues invalides, le second engendre celles qui
      // manquent. Le second est idempotent — un double-clic ne duplique rien.
      const res = await setOptions({
        variables: { input: { productId: product.id, axes: cleaned } },
      });
      if (res.data) setProduct(res.data.setShopProductOptions);
      const gen = await generate({ variables: { productId: product.id } });
      if (gen.data) setProduct(gen.data.generateShopProductVariants);
      showToast('Matrice des déclinaisons mise à jour', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function onSaveMatrix() {
    // Étape 1 — le plan, calculé et validé INTÉGRALEMENT avant la moindre
    // écriture (cf. `planMatrixSave`, testé isolément).
    const plan = planMatrixSave({ variants: matrix, rows, tracked });
    if (!plan.ok) {
      showToast(plan.error, 'error');
      return;
    }
    if (plan.steps.length === 0) {
      showToast('Aucune modification à enregistrer', 'success');
      return;
    }

    // Étape 2 — exécution en série. `updateShopProductVariant` d'abord : c'est
    // lui qui peut faire passer une déclinaison en stock suivi, ce dont la
    // correction d'inventaire a besoin pour aboutir.
    setSavingMatrix(true);
    try {
      for (const step of plan.steps) {
        if (step.update) {
          const res = await updateVariant({
            variables: {
              input: { variantId: step.variantId, ...step.update },
            },
          });
          if (res.data) setProduct(res.data.updateShopProductVariant);
        }
        if (step.countedOnHand !== null) {
          const res = await adjustStock({
            variables: {
              input: {
                variantId: step.variantId,
                countedOnHand: step.countedOnHand,
                reason: 'Saisie depuis la matrice des déclinaisons',
              },
            },
          });
          if (res.data) setProduct(res.data.adjustShopVariantStock);
        }
      }
      showToast(`${plan.steps.length} déclinaison(s) enregistrée(s)`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      setSavingMatrix(false);
    }
  }

  const busy = settingOptions || generating || savingMatrix;

  return (
    <Drawer
      open
      width={1040}
      title={`Déclinaisons — ${product.name}`}
      onClose={onClose}
      footer={
        <div className="cf-form-actions">
          <button
            type="button"
            className="cf-btn cf-btn--primary"
            onClick={onClose}
          >
            Terminé
          </button>
        </div>
      }
    >
      <section className="cf-variant-section">
        <h3 className="cf-variant-section__title">1. Les axes de variation</h3>
        <p className="cf-muted">
          Nommez ce qui distingue vos articles (« Taille », « Couleur »), puis
          listez les valeurs séparées par des virgules. La matrice de toutes les
          combinaisons est engendrée pour vous.
        </p>
        <ul className="cf-survey-options-editor">
          {(axes ?? []).map((axis, index) => (
            <li key={index} className="cf-survey-options-editor__row">
              <input
                type="text"
                className="cf-input"
                placeholder="Taille"
                value={axis.name}
                maxLength={60}
                onChange={(e) =>
                  setAxes((prev) =>
                    (prev ?? []).map((a, i) =>
                      i === index ? { ...a, name: e.target.value } : a,
                    ),
                  )
                }
              />
              <input
                type="text"
                className="cf-input"
                placeholder="S, M, L, XL"
                value={axis.valuesText}
                onChange={(e) =>
                  setAxes((prev) =>
                    (prev ?? []).map((a, i) =>
                      i === index ? { ...a, valuesText: e.target.value } : a,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="cf-btn cf-btn--ghost cf-btn--sm"
                aria-label="Retirer cet axe"
                onClick={() =>
                  setAxes((prev) => (prev ?? []).filter((_, i) => i !== index))
                }
              >
                <span className="material-symbols-outlined" aria-hidden>
                  delete
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="cf-toolbar">
          <button
            type="button"
            className="cf-btn"
            disabled={(axes ?? []).length >= 4}
            onClick={() =>
              setAxes((prev) => [...(prev ?? []), { name: '', valuesText: '' }])
            }
          >
            Ajouter un axe
          </button>
          <button
            type="button"
            className="cf-btn cf-btn--primary"
            disabled={busy}
            onClick={() => void onSaveAxes()}
          >
            Engendrer la matrice
          </button>
        </div>
        <span className="cf-field__hint">
          Retirer une valeur ne supprime rien : les combinaisons devenues
          impossibles sont désactivées, pour ne pas emporter l’historique des
          commandes qui les référencent.
        </span>
      </section>

      <section className="cf-variant-section">
        <h3 className="cf-variant-section__title">
          2. La matrice ({matrix.length} combinaison
          {matrix.length > 1 ? 's' : ''})
        </h3>
        {matrix.length === 0 ? (
          <p className="cf-muted">
            Définissez vos axes ci-dessus, puis engendrez la matrice.
          </p>
        ) : (
          <>
            <label className="cf-checkbox">
              <input
                type="checkbox"
                checked={tracked}
                onChange={(e) => setTracked(e.target.checked)}
              />
              <span>
                Suivre le stock de ces déclinaisons (décoché = stock illimité)
              </span>
            </label>
            <div className="cf-variant-matrix">
              <table className="cf-data-table">
                <thead>
                  <tr>
                    <th>En vente</th>
                    <th>Combinaison</th>
                    <th>Référence (SKU)</th>
                    <th>Prix (€)</th>
                    <th>Stock compté</th>
                    <th>Vendable</th>
                    <th>Seuil d’alerte</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((v) => {
                    const row = rows[v.id];
                    if (!row) return null;
                    return (
                      <tr key={v.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={row.active}
                            aria-label={`Mettre en vente ${v.label ?? ''}`}
                            onChange={(e) =>
                              patchRow(v.id, { active: e.target.checked })
                            }
                          />
                        </td>
                        <td>
                          <strong>{v.label ?? '—'}</strong>
                          {v.belowThreshold ? (
                            <>
                              {' '}
                              <span className="cf-pill cf-pill--warn">
                                sous le seuil
                              </span>
                            </>
                          ) : null}
                        </td>
                        <td>
                          <input
                            type="text"
                            className="cf-input"
                            value={row.sku}
                            maxLength={60}
                            onChange={(e) =>
                              patchRow(v.id, { sku: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            inputMode="decimal"
                            className="cf-input"
                            value={row.priceEuros}
                            placeholder="prix du produit"
                            onChange={(e) =>
                              patchRow(v.id, { priceEuros: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            className="cf-input"
                            value={tracked ? row.countedStr : ''}
                            placeholder={tracked ? '0' : 'illimité'}
                            disabled={!tracked}
                            onChange={(e) =>
                              patchRow(v.id, { countedStr: e.target.value })
                            }
                          />
                        </td>
                        <td className="cf-muted">
                          {v.trackStock && v.available !== null
                            ? v.available
                            : '∞'}
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            className="cf-input"
                            value={row.thresholdStr}
                            placeholder="aucun"
                            disabled={!tracked}
                            onChange={(e) =>
                              patchRow(v.id, { thresholdStr: e.target.value })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <span className="cf-field__hint">
              « Stock compté » est ce que vous avez physiquement dans le
              placard ; « Vendable » en retire ce qui est déjà réservé par une
              commande en attente. Un prix laissé vide reprend celui du produit.
            </span>
            <div className="cf-form-actions">
              <button
                type="button"
                className="cf-btn cf-btn--primary"
                disabled={busy}
                onClick={() => void onSaveMatrix()}
              >
                Enregistrer la matrice
              </button>
            </div>
          </>
        )}
      </section>
    </Drawer>
  );
}

function ProductsTab() {
  const { showToast } = useToast();
  const { data, refetch, loading } = useQuery<ShopProductsQueryData>(
    SHOP_PRODUCTS,
    { fetchPolicy: 'cache-and-network' },
  );
  const [create, { loading: creating }] =
    useMutation<CreateShopProductMutationData>(CREATE_SHOP_PRODUCT);
  const [update, { loading: updating }] =
    useMutation<UpdateShopProductMutationData>(UPDATE_SHOP_PRODUCT);
  const [remove] = useMutation(DELETE_SHOP_PRODUCT);
  const [setOptions] = useMutation<SetShopProductOptionsMutationData>(
    SET_SHOP_PRODUCT_OPTIONS,
  );
  const [updateVariant] = useMutation<UpdateShopProductVariantMutationData>(
    UPDATE_SHOP_PRODUCT_VARIANT,
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ShopProduct | null>(null);
  const [confirmDel, setConfirmDel] = useState<ShopProduct | null>(null);
  /** Produit dont on édite les déclinaisons. Null = sous-écran fermé. */
  const [variantsFor, setVariantsFor] = useState<ShopProduct | null>(null);
  /** Produit dont on s'apprête à retirer les déclinaisons (confirmation). */
  const [confirmFlatten, setConfirmFlatten] = useState<ShopProduct | null>(null);

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [priceEuros, setPriceEuros] = useState('');
  const [stockStr, setStockStr] = useState('');
  const [active, setActive] = useState(true);
  /**
   * LA bascule de l'ADR-0012 : décochée par défaut, et tant qu'elle l'est, le
   * formulaire est exactement celui d'avant. La complexité du modèle ne remonte
   * pas à l'écran d'un trésorier qui vend un porte-clés.
   */
  const [withVariants, setWithVariants] = useState(false);

  const products = data?.shopProducts ?? [];

  function openCreate() {
    setEditing(null);
    setName('');
    setSku('');
    setDescription('');
    setImageUrl('');
    setPriceEuros('');
    setStockStr('');
    setActive(true);
    setWithVariants(false);
    setDrawerOpen(true);
  }
  function openEdit(p: ShopProduct) {
    setEditing(p);
    setName(p.name);
    setSku(p.sku ?? '');
    setDescription(p.description ?? '');
    setImageUrl(p.imageUrl ?? '');
    setPriceEuros((p.priceCents / 100).toString().replace('.', ','));
    setStockStr(p.stock === null ? '' : String(p.stock));
    setActive(p.active);
    setWithVariants(p.hasVariants);
    setDrawerOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const priceCents = Math.round(
      Number(priceEuros.replace(',', '.')) * 100,
    );
    if (!name.trim() || isNaN(priceCents) || priceCents < 0) {
      showToast('Nom et prix requis', 'error');
      return;
    }
    const stockValue = stockStr.trim() === '' ? undefined : Number(stockStr);
    if (stockStr.trim() !== '' && (isNaN(stockValue!) || stockValue! < 0)) {
      showToast('Stock invalide', 'error');
      return;
    }
    try {
      let saved: ShopProduct | null = null;
      if (editing) {
        const res = await update({
          variables: {
            input: {
              id: editing.id,
              name: name.trim(),
              sku: sku.trim() || undefined,
              description: description.trim() || undefined,
              imageUrl: imageUrl.trim() || undefined,
              priceCents,
              // Le stock du produit pilote la déclinaison par défaut. Il n'a
              // plus de sens dès qu'il y a une matrice : chaque combinaison
              // porte le sien.
              stock: withVariants ? undefined : stockValue,
              active,
            },
          },
        });
        saved = res.data?.updateShopProduct ?? null;
        showToast('Produit mis à jour', 'success');
      } else {
        const res = await create({
          variables: {
            input: {
              name: name.trim(),
              sku: sku.trim() || undefined,
              description: description.trim() || undefined,
              imageUrl: imageUrl.trim() || undefined,
              priceCents,
              stock: withVariants ? undefined : stockValue,
              active,
            },
          },
        });
        saved = res.data?.createShopProduct ?? null;
        showToast('Produit créé', 'success');
      }
      setDrawerOpen(false);
      await refetch();

      if (!saved) return;
      if (withVariants) {
        // Enchaînement direct sur le sous-écran : à la création, le produit
        // doit exister avant qu'on puisse lui poser des axes.
        setVariantsFor(saved);
      } else if (saved.hasVariants) {
        setConfirmFlatten(saved);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  /**
   * Ramène un produit à l'état simple.
   *
   * Deux appels, et le second n'est pas facultatif : retirer les axes désactive
   * toutes les combinaisons devenues invalides, mais l'API ne RÉACTIVE jamais
   * rien d'elle-même — elle ressusciterait des déclinaisons délibérément
   * retirées de la vente. Sans la réactivation explicite de la déclinaison par
   * défaut, le produit se retrouverait donc sans aucune déclinaison active,
   * c'est-à-dire invendable, et en silence.
   */
  async function onFlatten() {
    const target = confirmFlatten;
    if (!target) return;
    try {
      const res = await setOptions({
        variables: { input: { productId: target.id, axes: [] } },
      });
      const fresh = res.data?.setShopProductOptions;
      const def = fresh?.variants.find((v) => v.isDefault);
      if (def && !def.active) {
        await updateVariant({
          variables: { input: { variantId: def.id, active: true } },
        });
      }
      showToast('Déclinaisons retirées', 'success');
      setConfirmFlatten(null);
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await remove({ variables: { id: confirmDel.id } });
      showToast('Produit supprimé', 'success');
      setConfirmDel(null);
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  return (
    <div>
      <div className="cf-toolbar">
        <button
          type="button"
          className="cf-btn cf-btn--primary"
          onClick={openCreate}
        >
          <span className="material-symbols-outlined" aria-hidden>
            add
          </span>
          Nouveau produit
        </button>
      </div>

      {loading && products.length === 0 ? (
        <p className="cf-muted">Chargement…</p>
      ) : products.length === 0 ? (
        <EmptyState
          icon="storefront"
          title="Aucun produit"
          message="Ajoutez votre premier article à la boutique."
          action={
            <button
              type="button"
              className="cf-btn cf-btn--primary"
              onClick={openCreate}
            >
              Nouveau produit
            </button>
          }
        />
      ) : (
        <ul className="cf-product-list">
          {products.map((p) => (
            <li
              key={p.id}
              className={`cf-product-card${p.active ? '' : ' cf-product-card--off'}`}
            >
              {p.imageUrl ? (
                <img
                  src={p.imageUrl}
                  alt=""
                  className="cf-product-card__img"
                />
              ) : (
                <div className="cf-product-card__img cf-product-card__img--placeholder">
                  <span className="material-symbols-outlined">
                    image_not_supported
                  </span>
                </div>
              )}
              <div className="cf-product-card__body">
                <div className="cf-product-card__head">
                  <h3 className="cf-product-card__name">{p.name}</h3>
                  <span
                    className={`cf-pill cf-pill--${p.active ? 'ok' : 'muted'}`}
                  >
                    {p.active ? 'Actif' : 'Désactivé'}
                  </span>
                </div>
                {p.sku ? <code className="cf-product-card__sku">{p.sku}</code> : null}
                <p className="cf-product-card__price">{fmtEuros(p.priceCents)}</p>
                {/*
                  La somme seule masquerait qu'il ne reste que des XXL : le
                  compteur des déclinaisons sous leur seuil l'accompagne
                  toujours. Le mot « déclinaison » n'apparaît que si le produit
                  en a vraiment — sur un porte-clés, on dit « stock bas ».
                */}
                <p className="cf-product-card__stock">
                  {p.stock === null ? 'Stock illimité' : `${p.stock} en stock`}
                  {p.variantsBelowThreshold > 0 ? (
                    <>
                      {' · '}
                      <span className="cf-pill cf-pill--warn">
                        {p.hasVariants
                          ? `${p.variantsBelowThreshold} déclinaison${
                              p.variantsBelowThreshold > 1 ? 's' : ''
                            } sous le seuil`
                          : 'stock bas'}
                      </span>
                    </>
                  ) : null}
                </p>
                <div className="cf-product-card__actions">
                  <button
                    type="button"
                    className="cf-btn"
                    onClick={() => openEdit(p)}
                  >
                    Modifier
                  </button>
                  {p.hasVariants ? (
                    <button
                      type="button"
                      className="cf-btn"
                      onClick={() => setVariantsFor(p)}
                    >
                      Déclinaisons
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="cf-btn cf-btn--danger"
                    onClick={() => setConfirmDel(p)}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={drawerOpen}
        title={editing ? 'Modifier le produit' : 'Nouveau produit'}
        onClose={() => setDrawerOpen(false)}
      >
        <form onSubmit={(e) => void onSubmit(e)} className="cf-form">
          <label className="cf-field">
            <span className="cf-field__label">Nom</span>
            <input
              type="text"
              className="cf-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={160}
            />
          </label>
          <label className="cf-field">
            <span className="cf-field__label">Référence (SKU)</span>
            <input
              type="text"
              className="cf-input"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              maxLength={60}
            />
          </label>
          <label className="cf-field">
            <span className="cf-field__label">Description</span>
            <textarea
              className="cf-input cf-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={4000}
            />
          </label>
          <label className="cf-field">
            <span className="cf-field__label">Image (URL)</span>
            <input
              type="url"
              className="cf-input"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
            />
          </label>
          <div className="cf-grid-2">
            <label className="cf-field">
              <span className="cf-field__label">Prix (€)</span>
              <input
                type="text"
                inputMode="decimal"
                className="cf-input"
                value={priceEuros}
                onChange={(e) => setPriceEuros(e.target.value)}
                required
                placeholder="0,00"
              />
            </label>
            {withVariants ? (
              <div className="cf-field">
                <span className="cf-field__label">Stock</span>
                <p className="cf-muted">
                  Géré combinaison par combinaison dans le sous-écran des
                  déclinaisons.
                </p>
              </div>
            ) : (
              <label className="cf-field">
                <span className="cf-field__label">Stock (vide = illimité)</span>
                <input
                  type="number"
                  min="0"
                  className="cf-input"
                  value={stockStr}
                  onChange={(e) => setStockStr(e.target.value)}
                />
              </label>
            )}
          </div>
          <label className="cf-checkbox">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <span>Produit actif (visible par les membres)</span>
          </label>
          <label className="cf-checkbox">
            <input
              type="checkbox"
              checked={withVariants}
              onChange={(e) => setWithVariants(e.target.checked)}
            />
            <span>Ce produit a des déclinaisons (taille, couleur…)</span>
          </label>
          {withVariants ? (
            <span className="cf-field__hint">
              Vous les configurerez à l’enregistrement : axes, puis matrice des
              combinaisons.
            </span>
          ) : null}
          <div className="cf-form-actions">
            <button
              type="button"
              className="cf-btn"
              onClick={() => setDrawerOpen(false)}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="cf-btn cf-btn--primary"
              disabled={creating || updating}
            >
              {editing ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      </Drawer>

      {variantsFor ? (
        <VariantsDrawer
          key={variantsFor.id}
          initialProduct={variantsFor}
          onClose={() => {
            setVariantsFor(null);
            void refetch();
          }}
        />
      ) : null}

      <ConfirmModal
        open={confirmDel !== null}
        title="Supprimer le produit ?"
        message={
          confirmDel
            ? `« ${confirmDel.name} » sera supprimé (ou désactivé s'il a déjà été commandé).`
            : ''
        }
        confirmLabel="Supprimer"
        danger
        onConfirm={() => void onDelete()}
        onCancel={() => setConfirmDel(null)}
      />

      <ConfirmModal
        open={confirmFlatten !== null}
        title="Retirer les déclinaisons ?"
        message={
          confirmFlatten
            ? `« ${confirmFlatten.name} » redeviendra un article simple. Les combinaisons existantes sont retirées de la vente mais conservées : l'historique des commandes qui les référencent reste lisible.`
            : ''
        }
        confirmLabel="Retirer"
        danger
        onConfirm={() => void onFlatten()}
        onCancel={() => setConfirmFlatten(null)}
      />
    </div>
  );
}

function OrdersTab() {
  const { showToast } = useToast();
  const { data, refetch, loading } = useQuery<ShopOrdersQueryData>(SHOP_ORDERS, {
    fetchPolicy: 'cache-and-network',
  });
  const [markPaid] = useMutation(MARK_SHOP_ORDER_PAID);
  const [cancel] = useMutation(CANCEL_SHOP_ORDER);

  const orders = data?.shopOrders ?? [];
  const [filter, setFilter] = useState<'ALL' | ShopOrder['status']>('ALL');
  const filtered = useMemo(
    () => (filter === 'ALL' ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter],
  );

  async function onMarkPaid(o: ShopOrder) {
    try {
      await markPaid({ variables: { id: o.id } });
      showToast('Commande marquée payée', 'success');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }
  async function onCancel(o: ShopOrder) {
    try {
      await cancel({ variables: { id: o.id } });
      showToast('Commande annulée', 'success');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  return (
    <div>
      <div className="cf-toolbar">
        <select
          className="cf-input"
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
        >
          <option value="ALL">Toutes</option>
          <option value="PENDING">En attente</option>
          <option value="PAID">Payées</option>
          <option value="CANCELLED">Annulées</option>
        </select>
      </div>
      {loading && filtered.length === 0 ? (
        <p className="cf-muted">Chargement…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="receipt_long"
          title="Aucune commande"
          message="Les commandes des membres apparaîtront ici."
        />
      ) : (
        <ul className="cf-order-list">
          {filtered.map((o) => {
            const pill = orderStatusPill(o.status);
            const buyer =
              `${o.buyerFirstName ?? ''} ${o.buyerLastName ?? ''}`.trim() ||
              '—';
            return (
              <li key={o.id} className="cf-order-card">
                <div className="cf-order-card__head">
                  <div>
                    <strong>{buyer}</strong>
                    <span className="cf-muted"> · {fmtDate(o.createdAt)}</span>
                  </div>
                  <span className={`cf-pill cf-pill--${pill.cls}`}>{pill.label}</span>
                </div>
                <ul className="cf-order-lines">
                  {o.lines.map((l) => (
                    <li key={l.id}>
                      <span>
                        {l.quantity} × {l.label}
                      </span>
                      <span>{fmtEuros(l.unitPriceCents * l.quantity)}</span>
                    </li>
                  ))}
                </ul>
                {o.note ? (
                  <p className="cf-order-card__note">« {o.note} »</p>
                ) : null}
                <div className="cf-order-card__foot">
                  <strong>Total : {fmtEuros(o.totalCents)}</strong>
                  <div className="cf-order-card__actions">
                    {o.status === 'PENDING' ? (
                      <>
                        <button
                          type="button"
                          className="cf-btn cf-btn--primary"
                          onClick={() => void onMarkPaid(o)}
                        >
                          Marquer payée
                        </button>
                        <button
                          type="button"
                          className="cf-btn cf-btn--danger"
                          onClick={() => void onCancel(o)}
                        >
                          Annuler
                        </button>
                      </>
                    ) : null}
                    {o.status === 'PAID' ? (
                      <span className="cf-muted">
                        Payée le {fmtDate(o.paidAt)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ===========================================================================
// Journal des mouvements de stock
// ===========================================================================

const MOVEMENTS_PAGE_SIZE = 50;

function MovementsTab() {
  const [variantId, setVariantId] = useState<string>('');
  const [page, setPage] = useState(0);

  // Le journal ne porte que des identifiants de déclinaison. Le catalogue sert
  // à les rendre lisibles — et à peupler le filtre.
  const { data: productsData } = useQuery<ShopProductsQueryData>(SHOP_PRODUCTS, {
    fetchPolicy: 'cache-first',
  });
  const products = useMemo(
    () => productsData?.shopProducts ?? [],
    [productsData],
  );

  const variantNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) {
      for (const v of p.variants) {
        map.set(v.id, variantDisplay(p.name, v.label));
      }
    }
    return map;
  }, [products]);

  const { data, loading } = useQuery<ShopStockMovementsQueryData>(
    SHOP_STOCK_MOVEMENTS,
    {
      variables: {
        variantId: variantId === '' ? null : variantId,
        take: MOVEMENTS_PAGE_SIZE,
        skip: page * MOVEMENTS_PAGE_SIZE,
      },
      fetchPolicy: 'cache-and-network',
    },
  );

  const rows = data?.shopStockMovements ?? [];
  // Pas de compte total côté API : une page pleine SUGGÈRE une suite, une page
  // incomplète prouve la fin. C'est tout ce dont la pagination a besoin.
  const hasNext = rows.length === MOVEMENTS_PAGE_SIZE;

  return (
    <div>
      <div className="cf-toolbar">
        <select
          className="cf-input"
          value={variantId}
          onChange={(e) => {
            setVariantId(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Toutes les déclinaisons</option>
          {products.map((p) => (
            <optgroup key={p.id} label={p.name}>
              {p.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label ?? p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {loading && rows.length === 0 ? (
        <p className="cf-muted">Chargement…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="inventory"
          title="Aucun mouvement"
          message="Réceptions, ventes, corrections et pertes apparaîtront ici."
        />
      ) : (
        <>
          <div className="cf-variant-matrix">
            <table className="cf-data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Article</th>
                  <th>Nature</th>
                  <th>Physique</th>
                  <th>Vendable</th>
                  <th>Motif</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td>{fmtDate(m.occurredAt)}</td>
                    <td>{variantNames.get(m.variantId) ?? '—'}</td>
                    <td>{MOVEMENT_LABELS[m.kind]}</td>
                    <td>{fmtDelta(m.onHandDelta)}</td>
                    <td>{fmtDelta(m.availableDelta)}</td>
                    <td className="cf-muted">
                      {m.reason ?? (m.orderId ? 'Commande' : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cf-toolbar">
            <button
              type="button"
              className="cf-btn"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Précédent
            </button>
            <span className="cf-muted">Page {page + 1}</span>
            <button
              type="button"
              className="cf-btn"
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ===========================================================================
// À réapprovisionner
//
// Vue transversale, tous produits confondus : c'est la liste de courses du
// trésorier, celle qui rend le suivi de stock utile à quelqu'un qui ne lit pas
// la boîte mail du club.
// ===========================================================================

function RestockTab() {
  const { showToast } = useToast();
  const { data, refetch, loading } = useQuery<ShopLowStockVariantsQueryData>(
    SHOP_LOW_STOCK_VARIANTS,
    { fetchPolicy: 'cache-and-network' },
  );
  const [restock, { loading: restocking }] =
    useMutation<RestockShopVariantMutationData>(RESTOCK_SHOP_VARIANT);
  const [triggerSweep, { loading: sweeping }] =
    useMutation<TriggerShopStockSweepMutationData>(TRIGGER_SHOP_STOCK_SWEEP);

  const [target, setTarget] = useState<ShopLowStockVariant | null>(null);
  const [qtyStr, setQtyStr] = useState('');
  const [reason, setReason] = useState('');

  const rows = data?.shopLowStockVariants ?? [];

  function openRestock(row: ShopLowStockVariant) {
    setTarget(row);
    // Quantité suggérée : de quoi revenir à la cible de réapprovisionnement,
    // sinon une unité de plus que le seuil.
    const goal = row.reorderTargetQty ?? row.reorderThreshold + 1;
    setQtyStr(String(Math.max(1, goal - row.available)));
    setReason('');
  }

  async function onRestock(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    const parsed = parseOptionalInt(qtyStr);
    if (!parsed.ok || parsed.value === null || parsed.value < 1) {
      showToast('Quantité reçue invalide', 'error');
      return;
    }
    try {
      await restock({
        variables: {
          input: {
            variantId: target.variantId,
            qty: parsed.value,
            reason: reason.trim() || undefined,
          },
        },
      });
      showToast('Réception enregistrée', 'success');
      setTarget(null);
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function onSweep() {
    try {
      const res = await triggerSweep();
      const r = res.data?.triggerShopStockSweep;
      // `null` = un balayage est déjà en cours (le cron de 7h, ou un autre
      // onglet). Le confondre avec un rapport à zéro afficherait un message
      // VERT « 0 déclinaison examinée » à un trésorier dont le catalogue est
      // en rupture — il en conclurait que tout va bien.
      if (!r) {
        showToast(
          'Un balayage est déjà en cours, réessayez dans un instant.',
          'error',
        );
        return;
      }
      showToast(
        `${r.examined} déclinaison(s) examinée(s), ${r.alerted} alerte(s) envoyée(s), ` +
          `${r.rearmed} réarmée(s)${r.failed > 0 ? `, ${r.failed} perdue(s)` : ''}`,
        r.failed > 0 ? 'error' : 'success',
      );
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  return (
    <div>
      <div className="cf-toolbar">
        <button
          type="button"
          className="cf-btn"
          disabled={sweeping}
          onClick={() => void onSweep()}
        >
          Relancer le contrôle des seuils
        </button>
        <span className="cf-muted">
          Le contrôle tourne chaque jour à 7 h ; ce bouton évite de l’attendre.
        </span>
      </div>

      {loading && rows.length === 0 ? (
        <p className="cf-muted">Chargement…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="inventory_2"
          title="Rien à réapprovisionner"
          message="Aucun article n’est passé sous son seuil d’alerte."
        />
      ) : (
        <div className="cf-variant-matrix">
          <table className="cf-data-table">
            <thead>
              <tr>
                <th>Article</th>
                <th>Vendable</th>
                <th>Physique</th>
                <th>Seuil</th>
                <th>Cible</th>
                <th>Club prévenu</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.variantId}>
                  <td>
                    <strong>{variantDisplay(row.productName, row.label)}</strong>
                    {row.sku ? (
                      <>
                        {' '}
                        <code className="cf-product-card__sku">{row.sku}</code>
                      </>
                    ) : null}
                  </td>
                  <td>
                    <span
                      className={`cf-pill cf-pill--${
                        row.available === 0 ? 'danger' : 'warn'
                      }`}
                    >
                      {row.available}
                    </span>
                  </td>
                  <td>{row.onHand}</td>
                  <td>{row.reorderThreshold}</td>
                  <td>{row.reorderTargetQty ?? '—'}</td>
                  <td className="cf-muted">
                    {row.alertedAt ? fmtDate(row.alertedAt) : 'pas encore'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="cf-btn cf-btn--sm"
                      onClick={() => openRestock(row)}
                    >
                      Réapprovisionner
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        open={target !== null}
        title={
          target
            ? `Réception — ${variantDisplay(target.productName, target.label)}`
            : ''
        }
        onClose={() => setTarget(null)}
      >
        <form onSubmit={(e) => void onRestock(e)} className="cf-form">
          <label className="cf-field">
            <span className="cf-field__label">Quantité reçue</span>
            <input
              type="number"
              min="1"
              className="cf-input"
              value={qtyStr}
              onChange={(e) => setQtyStr(e.target.value)}
              required
            />
            <span className="cf-field__hint">
              Une réception fait monter le physique et le vendable ensemble. Pour
              corriger un écart après comptage, passez plutôt par la matrice des
              déclinaisons.
            </span>
          </label>
          <label className="cf-field">
            <span className="cf-field__label">Motif (facultatif)</span>
            <input
              type="text"
              className="cf-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              placeholder="Livraison fournisseur du 12/03"
            />
          </label>
          <div className="cf-form-actions">
            <button
              type="button"
              className="cf-btn"
              onClick={() => setTarget(null)}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="cf-btn cf-btn--primary"
              disabled={restocking}
            >
              Enregistrer la réception
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}

type ShopTab = 'products' | 'orders' | 'movements' | 'restock';

export function ShopPage() {
  const [tab, setTab] = useState<ShopTab>('products');
  const tabs: Array<{ key: ShopTab; label: string }> = [
    { key: 'products', label: 'Produits' },
    { key: 'orders', label: 'Commandes' },
    { key: 'movements', label: 'Mouvements de stock' },
    { key: 'restock', label: 'À réapprovisionner' },
  ];
  return (
    <div className="cf-page">
      <header className="cf-page-header">
        <div>
          <h1 className="cf-page-title">Boutique</h1>
          <p className="cf-page-subtitle">
            Gérez votre catalogue d’articles et les commandes des membres.
          </p>
        </div>
      </header>
      <div className="cf-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`cf-tab${tab === t.key ? ' cf-tab--active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'products' ? <ProductsTab /> : null}
      {tab === 'orders' ? <OrdersTab /> : null}
      {tab === 'movements' ? <MovementsTab /> : null}
      {tab === 'restock' ? <RestockTab /> : null}
    </div>
  );
}
