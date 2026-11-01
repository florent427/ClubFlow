import { useMutation } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { SET_SHOP_VARIANT_BUNDLE } from '../../lib/documents';
import type {
  SetShopVariantBundleMutationData,
  ShopProduct,
  ShopProductVariant,
} from '../../lib/types';
import {
  bundlePieceOptions,
  planBundle,
  seedBundleRows,
  variantDisplayName,
} from '../../lib/shop-bundle';
import type { BundleRowDraft } from '../../lib/shop-bundle';
import { useToast } from '../../components/ToastProvider';
import { ConfirmModal, Drawer } from '../../components/ui';

/**
 * Composition des packs d'un produit (ADR-0024).
 *
 * Chaque déclinaison vendable du produit peut devenir un pack : « Pack poings
 * pieds — Rouge » contient les gants rouges et les protège-pieds rouges. Le
 * pack n'a pas de stock à lui ; vendre un pack réserve ses pièces, et leur
 * stock dit combien de packs sont vendables.
 */
export function BundleDrawer({
  initialProduct,
  products,
  onClose,
}: {
  initialProduct: ShopProduct;
  /** Tout le catalogue : les pièces sont les déclinaisons des autres produits. */
  products: ShopProduct[];
  onClose: () => void;
}) {
  const [product, setProduct] = useState<ShopProduct>(initialProduct);

  /** Les déclinaisons vendues : la matrice, ou la déclinaison par défaut seule. */
  const sellable = useMemo(
    () =>
      product.hasVariants
        ? product.variants.filter((v) => !v.isDefault)
        : product.variants.filter((v) => v.isDefault),
    [product],
  );
  const options = useMemo(
    () => bundlePieceOptions(products, product.id),
    [products, product.id],
  );

  return (
    <Drawer
      open
      width={880}
      title={`Pack — ${product.name}`}
      onClose={onClose}
      footer={
        <div className="cf-form-actions">
          <button type="button" className="cf-btn cf-btn--primary" onClick={onClose}>
            Terminé
          </button>
        </div>
      }
    >
      <p className="cf-muted">
        Un pack se vend comme un article, mais n’a pas de stock à lui : chaque
        vente réserve ses pièces, et le stock des pièces dit combien de packs
        restent vendables. Vendre les pièces seules reste possible, sur leur
        propre fiche.
      </p>
      {product.preorderEnabled ? (
        <p className="cf-muted">
          Ce produit est en précommande : désactivez-la sur sa fiche avant d’en
          faire un pack.
        </p>
      ) : null}
      {options.length === 0 ? (
        <p className="cf-muted">
          Aucune pièce possible : créez d’abord les articles vendus seuls
          (gants, protège-pieds…), avec un stock suivi.
        </p>
      ) : null}
      {sellable.map((v) => (
        <BundleVariantEditor
          key={v.id}
          product={product}
          variant={v}
          options={options}
          onSaved={setProduct}
        />
      ))}
    </Drawer>
  );
}

function BundleVariantEditor({
  product,
  variant,
  options,
  onSaved,
}: {
  product: ShopProduct;
  variant: ShopProductVariant;
  options: Array<{ variantId: string; label: string }>;
  onSaved: (p: ShopProduct) => void;
}) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<BundleRowDraft[]>(() => {
    const seeded = seedBundleRows(variant);
    return seeded.length > 0 ? seeded : [{ componentVariantId: '', quantityStr: '1' }];
  });
  const [confirmDissolve, setConfirmDissolve] = useState(false);
  const [save, { loading }] = useMutation<SetShopVariantBundleMutationData>(
    SET_SHOP_VARIANT_BUNDLE,
  );

  async function send(components: Array<{ componentVariantId: string; quantity: number }>) {
    try {
      const res = await save({
        variables: { input: { variantId: variant.id, components } },
      });
      if (res.data) onSaved(res.data.setShopVariantBundle);
      showToast(components.length === 0 ? 'Pack dissous' : 'Composition enregistrée', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function onSave() {
    const plan = planBundle(rows);
    if (!plan.ok) {
      showToast(plan.error, 'error');
      return;
    }
    await send(plan.components);
  }

  function patch(index: number, next: Partial<BundleRowDraft>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...next } : r)));
  }

  return (
    <section className="cf-variant-section">
      <h3 className="cf-variant-section__title">
        {variantDisplayName(product, variant)}{' '}
        {variant.isBundle ? (
          <span className="cf-pill cf-pill--info">
            pack · {variant.available ?? 0} vendable{(variant.available ?? 0) > 1 ? 's' : ''}
          </span>
        ) : (
          <span className="cf-pill cf-pill--muted">article stocké</span>
        )}
      </h3>
      {!variant.isBundle ? (
        <p className="cf-field__hint">
          Composer cette déclinaison en fait un pack. Son stock propre doit être
          à zéro : ramenez-le d’abord par une correction d’inventaire.
        </p>
      ) : null}
      <ul className="cf-survey-options-editor">
        {rows.map((row, index) => (
          <li key={index} className="cf-survey-options-editor__row">
            <select
              className="cf-input"
              value={row.componentVariantId}
              aria-label="Pièce du pack"
              onChange={(e) => patch(index, { componentVariantId: e.target.value })}
            >
              <option value="">— Choisir une pièce —</option>
              {options.map((o) => (
                <option key={o.variantId} value={o.variantId}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              max="99"
              className="cf-input"
              aria-label="Quantité par pack"
              value={row.quantityStr}
              onChange={(e) => patch(index, { quantityStr: e.target.value })}
            />
            <button
              type="button"
              className="cf-btn cf-btn--ghost cf-btn--sm"
              aria-label="Retirer cette pièce"
              onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
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
          disabled={rows.length >= 20}
          onClick={() =>
            setRows((prev) => [...prev, { componentVariantId: '', quantityStr: '1' }])
          }
        >
          Ajouter une pièce
        </button>
        <button
          type="button"
          className="cf-btn cf-btn--primary"
          disabled={loading}
          onClick={() => void onSave()}
        >
          {variant.isBundle ? 'Enregistrer la composition' : 'Faire de cette déclinaison un pack'}
        </button>
        {variant.isBundle ? (
          <button
            type="button"
            className="cf-btn cf-btn--danger"
            disabled={loading}
            onClick={() => setConfirmDissolve(true)}
          >
            Dissoudre le pack
          </button>
        ) : null}
      </div>
      <ConfirmModal
        open={confirmDissolve}
        title="Dissoudre ce pack ?"
        message={
          'La déclinaison redevient un article stocké, à zéro : elle ne se vendra ' +
          'plus jusqu’à sa prochaine entrée de stock. Les commandes déjà passées ' +
          'gardent les pièces qu’elles ont réservées.'
        }
        confirmLabel="Dissoudre"
        onConfirm={() => {
          setConfirmDissolve(false);
          setRows([{ componentVariantId: '', quantityStr: '1' }]);
          void send([]);
        }}
        onCancel={() => setConfirmDissolve(false)}
      />
    </section>
  );
}
