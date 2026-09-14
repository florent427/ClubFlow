import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  REMOVE_SHOP_PRODUCT_SUPPLIER,
  SET_SHOP_PRODUCT_PREFERRED_SUPPLIER,
  SET_SHOP_PRODUCT_SUPPLIER_VARIANT,
  SHOP_SUPPLIERS,
  UPSERT_SHOP_PRODUCT_SUPPLIER,
} from '../../lib/documents';
import type {
  RemoveShopProductSupplierMutationData,
  SetShopProductPreferredSupplierMutationData,
  SetShopProductSupplierVariantMutationData,
  ShopProduct,
  ShopProductSupplierOffer,
  ShopSuppliersQueryData,
  UpsertShopProductSupplierMutationData,
} from '../../lib/types';
import {
  linkableSuppliers,
  offerDraftFrom,
  overrideDraftFrom,
  planOffer,
  planOverrides,
} from '../../lib/shop-product-suppliers';
import type {
  OfferDraft,
  OverrideDraft,
} from '../../lib/shop-product-suppliers';
import { centsToInput } from '../../lib/shop-variant-matrix';
import { useToast } from '../../components/ToastProvider';
import { ConfirmModal, Drawer } from '../../components/ui';
import { fmtEuros } from './shop-format';

/**
 * Fournisseurs d'un produit (ADR-0021) : chez qui le club l'achète, à quelle
 * référence et à quel prix, et lequel est CHOISI pour le réapprovisionnement.
 *
 * Tiroir à part, comme les déclinaisons : chaque geste écrit aussitôt et rend
 * le produit à jour, sans formulaire global à enregistrer. Les refus viennent
 * du serveur — fournisseur choisi qu'on voudrait retirer, fournisseur
 * désactivé — et s'affichent tels quels : ils disent quoi faire.
 */
export function ProductSuppliersDrawer({
  initialProduct,
  onClose,
}: {
  initialProduct: ShopProduct;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [product, setProduct] = useState<ShopProduct>(initialProduct);

  const { data: supData } = useQuery<ShopSuppliersQueryData>(SHOP_SUPPLIERS, {
    variables: { includeInactive: false },
    fetchPolicy: 'cache-and-network',
  });

  const [upsert, { loading: upserting }] =
    useMutation<UpsertShopProductSupplierMutationData>(
      UPSERT_SHOP_PRODUCT_SUPPLIER,
    );
  const [removeOffer] = useMutation<RemoveShopProductSupplierMutationData>(
    REMOVE_SHOP_PRODUCT_SUPPLIER,
  );
  const [setPreferred] =
    useMutation<SetShopProductPreferredSupplierMutationData>(
      SET_SHOP_PRODUCT_PREFERRED_SUPPLIER,
    );
  const [setOverride] = useMutation<SetShopProductSupplierVariantMutationData>(
    SET_SHOP_PRODUCT_SUPPLIER_VARIANT,
  );

  const offers = product.suppliers ?? [];
  const candidates = linkableSuppliers(supData?.shopSuppliers ?? [], product);

  /** Offre en cours de modification ; null = formulaire d'ajout. */
  const [editing, setEditing] = useState<ShopProductSupplierOffer | null>(null);
  const [newSupplierId, setNewSupplierId] = useState('');
  const [draft, setDraft] = useState<OfferDraft>(offerDraftFrom(null));
  const [confirmRemove, setConfirmRemove] =
    useState<ShopProductSupplierOffer | null>(null);

  /** La matrice des exceptions, c'est tout sauf la déclinaison par défaut. */
  const variants = useMemo(
    () => product.variants.filter((v) => !v.isDefault),
    [product],
  );
  const [overrideOfferId, setOverrideOfferId] = useState<string | null>(null);
  const overrideOffer =
    offers.find((o) => o.id === overrideOfferId) ??
    offers.find((o) => o.preferred) ??
    offers[0] ??
    null;
  const [overrideRows, setOverrideRows] = useState<
    Record<string, OverrideDraft>
  >({});
  const [savingOverrides, setSavingOverrides] = useState(false);

  // Re-semé à chaque nouvelle version du produit : ce que l'écran affiche est
  // toujours ce que la base contient.
  useEffect(() => {
    const next: Record<string, OverrideDraft> = {};
    if (overrideOffer) {
      for (const v of variants) next[v.id] = overrideDraftFrom(overrideOffer, v.id);
    }
    setOverrideRows(next);
  }, [overrideOffer, variants]);

  function resetForm() {
    setEditing(null);
    setNewSupplierId('');
    setDraft(offerDraftFrom(null));
  }

  function openEdit(o: ShopProductSupplierOffer) {
    setEditing(o);
    setDraft(offerDraftFrom(o));
  }

  async function onSaveOffer(e: FormEvent) {
    e.preventDefault();
    const supplierId = editing ? editing.supplierId : newSupplierId;
    if (!supplierId) {
      showToast('Choisissez un fournisseur', 'error');
      return;
    }
    const plan = planOffer(draft);
    if (!plan.ok) {
      showToast(plan.error, 'error');
      return;
    }
    try {
      const res = await upsert({
        variables: {
          input: { productId: product.id, supplierId, ...plan.terms },
        },
      });
      if (res.data) setProduct(res.data.upsertShopProductSupplier);
      showToast(editing ? 'Fournisseur mis à jour' : 'Fournisseur rattaché', 'success');
      resetForm();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function onChoose(supplierId: string | null) {
    try {
      const res = await setPreferred({
        variables: { input: { productId: product.id, supplierId } },
      });
      if (res.data) setProduct(res.data.setShopProductPreferredSupplier);
      showToast(
        supplierId ? 'Fournisseur choisi' : 'Plus de réapprovisionnement automatique',
        'success',
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function onRemove() {
    const target = confirmRemove;
    if (!target) return;
    setConfirmRemove(null);
    try {
      const res = await removeOffer({
        variables: {
          input: { productId: product.id, supplierId: target.supplierId },
        },
      });
      if (res.data) setProduct(res.data.removeShopProductSupplier);
      if (editing?.id === target.id) resetForm();
      showToast('Fournisseur retiré', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Retrait refusé', 'error');
    }
  }

  async function onSaveOverrides() {
    if (!overrideOffer) return;
    const plan = planOverrides({
      offer: overrideOffer,
      variantIds: variants.map((v) => v.id),
      rows: overrideRows,
      labels: Object.fromEntries(
        variants.map((v) => [v.id, v.label ?? 'déclinaison']),
      ),
    });
    if (!plan.ok) {
      showToast(plan.error, 'error');
      return;
    }
    if (plan.steps.length === 0) {
      showToast('Aucune modification à enregistrer', 'success');
      return;
    }
    setSavingOverrides(true);
    try {
      for (const step of plan.steps) {
        const res = await setOverride({
          variables: { input: { offerId: overrideOffer.id, ...step } },
        });
        if (res.data) setProduct(res.data.setShopProductSupplierVariant);
      }
      showToast(`${plan.steps.length} exception(s) enregistrée(s)`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      setSavingOverrides(false);
    }
  }

  const hasChoice = offers.some((o) => o.preferred);

  return (
    <Drawer
      open
      width={960}
      title={`Fournisseurs — ${product.name}`}
      onClose={onClose}
      footer={
        <div className="cf-form-actions">
          <button type="button" className="cf-btn cf-btn--primary" onClick={onClose}>
            Terminé
          </button>
        </div>
      }
    >
      <section className="cf-variant-section">
        <h3 className="cf-variant-section__title">1. Chez qui acheter cet article</h3>
        <p className="cf-muted">
          Le fournisseur <strong>choisi</strong> est celui chez qui le
          réapprovisionnement commandera. Un seul par produit.
        </p>
        {offers.length === 0 ? (
          <p className="cf-muted">
            Aucun fournisseur rattaché : cet article ne sera jamais commandé
            automatiquement.
          </p>
        ) : (
          <div className="cf-variant-matrix">
            <table className="cf-data-table">
              <thead>
                <tr>
                  <th>Choisi</th>
                  <th>Fournisseur</th>
                  <th>Référence fournisseur</th>
                  <th>Prix d’achat HT</th>
                  <th>Colisage</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {offers.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <input
                        type="radio"
                        name="preferred-supplier"
                        checked={o.preferred}
                        disabled={!o.supplierActive}
                        aria-label={`Choisir ${o.supplierName}`}
                        onChange={() => void onChoose(o.supplierId)}
                      />
                    </td>
                    <td>
                      <strong>{o.supplierName}</strong>
                      {o.supplierActive ? null : (
                        <>
                          {' '}
                          <span className="cf-pill cf-pill--muted">désactivé</span>
                        </>
                      )}
                    </td>
                    <td>
                      {o.supplierRef ? (
                        <code className="cf-product-card__sku">{o.supplierRef}</code>
                      ) : (
                        '—'
                      )}
                    </td>
                    {/*
                      NULL veut dire « prix jamais renseigné », pas « gratuit » :
                      afficher 0 € le ferait lire comme un article offert.
                    */}
                    <td>
                      {o.unitCostCents === null ? (
                        <span className="cf-muted">inconnu</span>
                      ) : (
                        fmtEuros(o.unitCostCents)
                      )}
                    </td>
                    <td>{o.packSize === 1 ? 'à l’unité' : `par ${o.packSize}`}</td>
                    <td>
                      <button
                        type="button"
                        className="cf-btn cf-btn--sm"
                        onClick={() => openEdit(o)}
                      >
                        Modifier
                      </button>{' '}
                      <button
                        type="button"
                        className="cf-btn cf-btn--danger cf-btn--sm"
                        onClick={() => setConfirmRemove(o)}
                      >
                        Retirer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasChoice ? (
          <button
            type="button"
            className="cf-btn cf-btn--ghost cf-btn--sm"
            onClick={() => void onChoose(null)}
          >
            Ne plus commander cet article automatiquement
          </button>
        ) : offers.length > 0 ? (
          <span className="cf-field__hint">
            Aucun fournisseur choisi : l’article n’entrera pas dans le
            réapprovisionnement.
          </span>
        ) : null}
      </section>

      <section className="cf-variant-section">
        <h3 className="cf-variant-section__title">
          {editing ? `Modifier — ${editing.supplierName}` : '2. Rattacher un fournisseur'}
        </h3>
        <form className="cf-form" onSubmit={(e) => void onSaveOffer(e)}>
          {editing ? null : (
            <label className="cf-field">
              <span className="cf-field__label">Fournisseur</span>
              <select
                className="cf-input"
                value={newSupplierId}
                onChange={(e) => setNewSupplierId(e.target.value)}
              >
                <option value="">— Choisir —</option>
                {candidates.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {candidates.length === 0 ? (
                <span className="cf-field__hint">
                  Tous vos fournisseurs actifs sont déjà rattachés. Créez-en un
                  dans l’onglet Fournisseurs.
                </span>
              ) : null}
            </label>
          )}
          <div className="cf-grid-2">
            <label className="cf-field">
              <span className="cf-field__label">Référence chez le fournisseur</span>
              <input
                type="text"
                className="cf-input"
                maxLength={80}
                value={draft.supplierRef}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, supplierRef: e.target.value }))
                }
              />
            </label>
            <label className="cf-field">
              <span className="cf-field__label">Prix d’achat HT (€)</span>
              <input
                type="text"
                inputMode="decimal"
                className="cf-input"
                placeholder="inconnu"
                value={draft.costEuros}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, costEuros: e.target.value }))
                }
              />
            </label>
          </div>
          <label className="cf-field">
            <span className="cf-field__label">Colisage</span>
            <input
              type="number"
              min="1"
              className="cf-input"
              value={draft.packSizeStr}
              onChange={(e) =>
                setDraft((d) => ({ ...d, packSizeStr: e.target.value }))
              }
            />
            <span className="cf-field__hint">
              Le fournisseur vend par multiples de ce nombre : le
              réapprovisionnement arrondira ses quantités. Un prix laissé vide
              reste « inconnu », jamais 0 €.
            </span>
          </label>
          <div className="cf-form-actions">
            {editing ? (
              <button type="button" className="cf-btn" onClick={resetForm}>
                Annuler
              </button>
            ) : null}
            <button
              type="submit"
              className="cf-btn cf-btn--primary"
              disabled={upserting}
            >
              {editing ? 'Enregistrer' : 'Rattacher'}
            </button>
          </div>
        </form>
      </section>

      {variants.length > 0 && overrideOffer ? (
        <section className="cf-variant-section">
          <h3 className="cf-variant-section__title">3. Exceptions par déclinaison</h3>
          <p className="cf-muted">
            Une taille ou une couleur peut avoir sa propre référence ou son
            propre prix. Laissé vide, le champ reprend celui du fournisseur,
            affiché en grisé.
          </p>
          {offers.length > 1 ? (
            <label className="cf-field">
              <span className="cf-field__label">Chez</span>
              <select
                className="cf-input"
                value={overrideOffer.id}
                onChange={(e) => setOverrideOfferId(e.target.value)}
              >
                {offers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.supplierName}
                    {o.preferred ? ' (choisi)' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="cf-variant-matrix">
            <table className="cf-data-table">
              <thead>
                <tr>
                  <th>Déclinaison</th>
                  <th>Référence fournisseur</th>
                  <th>Prix d’achat HT (€)</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => {
                  const row = overrideRows[v.id];
                  if (!row) return null;
                  return (
                    <tr key={v.id}>
                      <td>
                        <strong>{v.label ?? '—'}</strong>
                      </td>
                      <td>
                        <input
                          type="text"
                          className="cf-input"
                          maxLength={80}
                          value={row.supplierRef}
                          placeholder={overrideOffer.supplierRef ?? '—'}
                          onChange={(e) =>
                            setOverrideRows((prev) => ({
                              ...prev,
                              [v.id]: { ...prev[v.id], supplierRef: e.target.value },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="cf-input"
                          value={row.costEuros}
                          placeholder={
                            overrideOffer.unitCostCents === null
                              ? 'inconnu'
                              : centsToInput(overrideOffer.unitCostCents)
                          }
                          onChange={(e) =>
                            setOverrideRows((prev) => ({
                              ...prev,
                              [v.id]: { ...prev[v.id], costEuros: e.target.value },
                            }))
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="cf-form-actions">
            <button
              type="button"
              className="cf-btn cf-btn--primary"
              disabled={savingOverrides}
              onClick={() => void onSaveOverrides()}
            >
              Enregistrer les exceptions
            </button>
          </div>
        </section>
      ) : null}

      <ConfirmModal
        open={confirmRemove !== null}
        title="Retirer ce fournisseur ?"
        message={
          confirmRemove
            ? `« ${confirmRemove.supplierName} » ne fournira plus « ${product.name} », et ses exceptions par déclinaison disparaîtront. Les commandes déjà passées chez lui ne changent pas.`
            : ''
        }
        confirmLabel="Retirer"
        danger
        onConfirm={() => void onRemove()}
        onCancel={() => setConfirmRemove(null)}
      />
    </Drawer>
  );
}
