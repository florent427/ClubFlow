import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CREATE_SHOP_RESTOCK_ORDERS,
  RESTOCK_SHOP_VARIANT,
  SHOP_PRODUCTS,
  SHOP_PURCHASE_ORDERS,
  SHOP_RESTOCK_PLAN,
  TRIGGER_SHOP_STOCK_SWEEP,
} from '../../lib/documents';
import type {
  CreateShopRestockOrdersMutationData,
  RestockShopVariantMutationData,
  ShopProductsQueryData,
  ShopRestockLine,
  ShopRestockPlanQueryData,
  TriggerShopStockSweepMutationData,
} from '../../lib/types';
import { parseOptionalInt } from '../../lib/shop-variant-matrix';
import {
  groupPreview,
  planRestockOrders,
  refreshPreview,
  seedPreview,
  switchableOffers,
  switchSupplier,
} from '../../lib/shop-restock';
import type { PreviewLine } from '../../lib/shop-restock';
import { useToast } from '../../components/ToastProvider';
import { Drawer, EmptyState } from '../../components/ui';
import { ProductSuppliersDrawer } from './ProductSuppliersDrawer';
import { fmtDate, fmtEuros, variantDisplay } from './shop-format';

type CreatedOrders = CreateShopRestockOrdersMutationData['createShopRestockOrders'];

/**
 * À réapprovisionner (ADR-0021 §3-4).
 *
 * La liste vient du PLAN du serveur — sous le seuil ou attendu en précommande,
 * avec l'encours, les brouillons et le fournisseur choisi —, jamais d'un calcul
 * refait à l'écran. « Réapprovisionner » ouvre l'aperçu groupé par fournisseur,
 * qui crée les brouillons. L'entrée de stock directe reste possible, pour un
 * achat en magasin, mais en action secondaire : elle contourne les commandes,
 * donc l'encours.
 */
export function RestockTab({
  onOpenPurchaseOrder,
}: {
  onOpenPurchaseOrder: (orderId: string) => void;
}) {
  const { showToast } = useToast();
  const { data, refetch, loading } = useQuery<ShopRestockPlanQueryData>(
    SHOP_RESTOCK_PLAN,
    { fetchPolicy: 'cache-and-network' },
  );
  const [restock, { loading: restocking }] =
    useMutation<RestockShopVariantMutationData>(RESTOCK_SHOP_VARIANT);
  const [triggerSweep, { loading: sweeping }] =
    useMutation<TriggerShopStockSweepMutationData>(TRIGGER_SHOP_STOCK_SWEEP);
  const [createOrders, { loading: creatingOrders }] =
    useMutation<CreateShopRestockOrdersMutationData>(CREATE_SHOP_RESTOCK_ORDERS);

  const plan = data?.shopRestockPlan ?? null;
  const rows = useMemo(
    () =>
      plan
        ? [
            ...plan.groups.flatMap((g) => g.lines),
            ...plan.withoutSupplier,
            ...plan.inactiveSupplier,
            ...plan.covered,
          ]
        : [],
    [plan],
  );
  const toOrderCount = rows.filter((row) => row.shortfall > 0).length;

  /** Entrée de stock hors commande. */
  const [target, setTarget] = useState<ShopRestockLine | null>(null);
  const [qtyStr, setQtyStr] = useState('');
  const [reason, setReason] = useState('');

  /** Aperçu du réapprovisionnement ; null = fermé. */
  const [preview, setPreview] = useState<PreviewLine[] | null>(null);
  const [created, setCreated] = useState<CreatedOrders | null>(null);

  // Rattacher un fournisseur depuis l'aperçu : le tiroir des fournisseurs a
  // besoin du produit entier, que le plan ne porte pas.
  const [suppliersForProductId, setSuppliersForProductId] = useState<string | null>(null);
  const { data: productsData } = useQuery<ShopProductsQueryData>(SHOP_PRODUCTS, {
    skip: suppliersForProductId === null,
    fetchPolicy: 'cache-and-network',
  });
  const productForSuppliers =
    productsData?.shopProducts.find((p) => p.id === suppliersForProductId) ?? null;

  function openRestock(row: ShopRestockLine) {
    setTarget(row);
    setQtyStr(String(Math.max(1, row.shortfall)));
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
      showToast('Entrée de stock enregistrée', 'success');
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
        showToast('Un balayage est déjà en cours, réessayez dans un instant.', 'error');
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

  function openPreview() {
    if (!plan) return;
    setCreated(null);
    setPreview(seedPreview(plan));
  }

  function patchPreview(variantId: string, next: (p: PreviewLine) => PreviewLine) {
    setPreview((prev) =>
      prev ? prev.map((p) => (p.line.variantId === variantId ? next(p) : p)) : prev,
    );
  }

  async function onCreateOrders() {
    if (!preview) return;
    const planned = planRestockOrders(preview);
    if (!planned.ok) {
      showToast(planned.error, 'error');
      return;
    }
    try {
      const res = await createOrders({
        variables: { input: { lines: planned.lines } },
        refetchQueries: [{ query: SHOP_RESTOCK_PLAN }, { query: SHOP_PURCHASE_ORDERS }],
        awaitRefetchQueries: true,
      });
      const orders = res.data?.createShopRestockOrders ?? [];
      setCreated(orders);
      showToast(`${orders.length} brouillon(s) prêt(s) à relire`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function onSuppliersClosed() {
    const productId = suppliersForProductId;
    setSuppliersForProductId(null);
    const fresh = await refetch();
    const freshPlan = fresh.data?.shopRestockPlan;
    if (freshPlan && productId) {
      setPreview((prev) => (prev ? refreshPreview(prev, freshPlan, productId) : prev));
    }
  }

  const grouped = preview ? groupPreview(preview) : null;

  return (
    <div>
      <div className="cf-toolbar">
        <button
          type="button"
          className="cf-btn cf-btn--primary"
          disabled={!plan || toOrderCount === 0}
          onClick={openPreview}
        >
          <span className="material-symbols-outlined" aria-hidden>
            local_shipping
          </span>
          Réapprovisionner
        </button>
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
          message="Aucun article n’est sous son seuil d’alerte, ni attendu en précommande."
        />
      ) : (
        <div className="cf-variant-matrix">
          <table className="cf-data-table">
            <thead>
              <tr>
                <th>Article</th>
                <th>Vendable</th>
                <th>Seuil</th>
                <th>Cible</th>
                <th>En commande</th>
                <th>En brouillon</th>
                <th>Précommandes</th>
                <th>À commander</th>
                <th>Fournisseur choisi</th>
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
                      className={`cf-pill cf-pill--${row.available === 0 ? 'danger' : 'warn'}`}
                    >
                      {row.available}
                    </span>
                    {row.onHand !== row.available ? (
                      <div className="cf-muted">physique : {row.onHand}</div>
                    ) : null}
                  </td>
                  <td>{row.reorderThreshold ?? '—'}</td>
                  <td>{row.target}</td>
                  <td className="cf-muted">{row.onOrder > 0 ? row.onOrder : '—'}</td>
                  <td className="cf-muted">{row.inDraft > 0 ? row.inDraft : '—'}</td>
                  <td className="cf-muted">{row.preordered > 0 ? row.preordered : '—'}</td>
                  <td>
                    {row.shortfall === 0 ? (
                      <span className="cf-pill cf-pill--ok">couvert</span>
                    ) : (
                      <strong>{row.shortfall}</strong>
                    )}
                  </td>
                  <td>
                    {row.supplier ? (
                      row.supplier.supplierActive ? (
                        row.supplier.supplierName
                      ) : (
                        <span className="cf-muted">
                          {row.supplier.supplierName} (désactivé)
                        </span>
                      )
                    ) : (
                      <span className="cf-muted">aucun</span>
                    )}
                  </td>
                  <td className="cf-muted">
                    {row.alertedAt
                      ? fmtDate(row.alertedAt)
                      : row.reorderThreshold === null
                        ? '—'
                        : 'pas encore'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="cf-btn cf-btn--ghost cf-btn--sm"
                      onClick={() => openRestock(row)}
                    >
                      Entrée hors commande
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <span className="cf-field__hint">
            « À commander » : la cible, plus les précommandes, moins le vendable,
            ce qui est déjà en commande et ce qui attend dans un brouillon. Une
            livraison de commande se réceptionne dans « Commandes fournisseur ».
          </span>
        </div>
      )}

      <Drawer
        open={target !== null}
        title={
          target ? `Entrée hors commande — ${variantDisplay(target.productName, target.label)}` : ''
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
              Pour un achat fait hors commande fournisseur, en magasin par
              exemple. Une livraison de commande se réceptionne depuis l’onglet
              « Commandes fournisseur » : c’est là qu’elle solde l’encours.
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
              placeholder="Achat en magasin du 12/03"
            />
          </label>
          <div className="cf-form-actions">
            <button type="button" className="cf-btn" onClick={() => setTarget(null)}>
              Annuler
            </button>
            <button type="submit" className="cf-btn cf-btn--primary" disabled={restocking}>
              Enregistrer l’entrée
            </button>
          </div>
        </form>
      </Drawer>

      <Drawer
        open={preview !== null}
        width={1100}
        title="Réapprovisionner — aperçu"
        onClose={() => setPreview(null)}
        footer={
          created ? (
            <div className="cf-form-actions">
              <button
                type="button"
                className="cf-btn cf-btn--primary"
                onClick={() => setPreview(null)}
              >
                Fermer
              </button>
            </div>
          ) : (
            <div className="cf-form-actions">
              <button type="button" className="cf-btn" onClick={() => setPreview(null)}>
                Annuler
              </button>
              <button
                type="button"
                className="cf-btn cf-btn--primary"
                disabled={creatingOrders}
                onClick={() => void onCreateOrders()}
              >
                Créer les brouillons
              </button>
            </div>
          )
        }
      >
        {created ? (
          <section className="cf-variant-section">
            <h3 className="cf-variant-section__title">Brouillons prêts à relire</h3>
            <p className="cf-muted">
              Rien n’est parti chez les fournisseurs. Relisez chaque brouillon,
              puis envoyez-le depuis l’onglet « Commandes fournisseur ».
            </p>
            <table className="cf-data-table">
              <tbody>
                {created.map((r) => (
                  <tr key={r.order.id}>
                    <td>
                      <strong>{r.order.reference}</strong>
                    </td>
                    <td>{r.order.supplier?.name ?? '—'}</td>
                    <td>{r.created ? 'nouveau brouillon' : 'brouillon complété'}</td>
                    <td>
                      {r.lineCount} ligne{r.lineCount > 1 ? 's' : ''}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="cf-btn cf-btn--sm"
                        onClick={() => onOpenPurchaseOrder(r.order.id)}
                      >
                        Ouvrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : grouped ? (
          <>
            {grouped.groups.map((g) => (
              <section key={g.supplierId} className="cf-variant-section">
                <h3 className="cf-variant-section__title">{g.supplierName}</h3>
                {/*
                  Un prix inconnu compte pour rien dans le total : c'est un
                  minimum, et l'écran le dit plutôt que de laisser lire un
                  montant de commande.
                */}
                <p className="cf-muted">
                  Total HT {g.unknownCostLines > 0 ? 'd’au moins ' : ''}
                  {fmtEuros(g.knownTotalCents)}
                  {g.unknownCostLines > 0
                    ? ` — ${g.unknownCostLines} article(s) au prix inconnu`
                    : ''}
                </p>
                <PreviewTable lines={g.lines} onPatch={patchPreview} />
              </section>
            ))}
            <UnassignedSections
              lines={grouped.unassigned}
              onPatch={patchPreview}
              onOpenSuppliers={setSuppliersForProductId}
            />
            {grouped.groups.length === 0 && grouped.unassigned.length === 0 ? (
              <p className="cf-muted">Rien à commander.</p>
            ) : null}
            {plan && plan.covered.length > 0 ? (
              <span className="cf-field__hint">
                {plan.covered.length} article(s) sous le seuil déjà couvert(s) par
                l’encours ou un brouillon : rien à commander pour eux.
              </span>
            ) : null}
          </>
        ) : null}
      </Drawer>

      {productForSuppliers ? (
        <ProductSuppliersDrawer
          key={productForSuppliers.id}
          initialProduct={productForSuppliers}
          onClose={() => void onSuppliersClosed()}
        />
      ) : null}
    </div>
  );
}

type PatchPreview = (variantId: string, next: (p: PreviewLine) => PreviewLine) => void;

/**
 * Les deux groupes jamais commandés en l'état (ADR-0021 §4) : le fournisseur
 * choisi est désactivé, ou aucun n'est retenu — pas de choix sur le produit, ou
 * « ne pas commander » sélectionné dans l'aperçu.
 */
function UnassignedSections({
  lines,
  onPatch,
  onOpenSuppliers,
}: {
  lines: PreviewLine[];
  onPatch: PatchPreview;
  onOpenSuppliers: (productId: string) => void;
}) {
  const inactive = lines.filter((p) => p.line.supplier?.supplierActive === false);
  const without = lines.filter((p) => p.line.supplier?.supplierActive !== false);
  return (
    <>
      {inactive.length > 0 ? (
        <section className="cf-variant-section">
          <h3 className="cf-variant-section__title">Fournisseur inactif</h3>
          <p className="cf-muted">
            Le fournisseur choisi pour ces articles est désactivé : rien ne sera
            commandé chez lui. Basculez-les vers un autre fournisseur du produit,
            ou changez le choix sur la fiche du produit.
          </p>
          <PreviewTable lines={inactive} onPatch={onPatch} onOpenSuppliers={onOpenSuppliers} />
        </section>
      ) : null}
      {without.length > 0 ? (
        <section className="cf-variant-section">
          <h3 className="cf-variant-section__title">Sans fournisseur</h3>
          <p className="cf-muted">
            Aucun fournisseur n’est retenu pour ces articles : ils ne seront pas
            commandés. Choisissez-en un, ou rattachez-en un au produit.
          </p>
          <PreviewTable lines={without} onPatch={onPatch} onOpenSuppliers={onOpenSuppliers} />
        </section>
      ) : null}
    </>
  );
}

/** Les lignes d'un groupe de l'aperçu : fournisseur, quantité, prix. */
function PreviewTable({
  lines,
  onPatch,
  onOpenSuppliers,
}: {
  lines: PreviewLine[];
  onPatch: PatchPreview;
  /** Groupes jamais commandés : ouvrir les fournisseurs du produit. */
  onOpenSuppliers?: (productId: string) => void;
}) {
  return (
    <div className="cf-variant-matrix">
      <table className="cf-data-table">
        <thead>
          <tr>
            <th>Article</th>
            <th>Manque</th>
            <th>Fournisseur</th>
            <th>Réf. fournisseur</th>
            <th>Colisage</th>
            <th>Quantité</th>
            <th>Prix HT</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((p) => {
            const name = variantDisplay(p.line.productName, p.line.label);
            const offers = switchableOffers(p.line);
            const offer = offers.find((o) => o.supplierId === p.supplierId) ?? null;
            return (
              <tr key={p.line.variantId}>
                <td>
                  <strong>{name}</strong>
                  {p.line.preordered > 0 ? (
                    <div className="cf-muted">{p.line.preordered} en précommande</div>
                  ) : null}
                </td>
                <td>{p.line.shortfall}</td>
                <td>
                  {offers.length > 0 ? (
                    <select
                      className="cf-input"
                      value={p.supplierId ?? ''}
                      aria-label={`Fournisseur pour ${name}`}
                      onChange={(e) =>
                        onPatch(p.line.variantId, (cur) =>
                          switchSupplier(cur, e.target.value || null),
                        )
                      }
                    >
                      <option value="">— ne pas commander —</option>
                      {offers.map((o) => (
                        <option key={o.supplierId} value={o.supplierId}>
                          {o.supplierName}
                        </option>
                      ))}
                    </select>
                  ) : onOpenSuppliers ? null : (
                    <span className="cf-muted">aucun</span>
                  )}
                  {onOpenSuppliers ? (
                    <button
                      type="button"
                      className={
                        offers.length > 0 ? 'cf-btn cf-btn--ghost cf-btn--sm' : 'cf-btn cf-btn--sm'
                      }
                      onClick={() => onOpenSuppliers(p.line.productId)}
                    >
                      {offers.length > 0 ? 'Fournisseurs du produit' : 'Rattacher un fournisseur'}
                    </button>
                  ) : null}
                </td>
                <td>
                  {offer?.supplierRef ? (
                    <code className="cf-product-card__sku">{offer.supplierRef}</code>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {offer ? (offer.packSize === 1 ? 'à l’unité' : `par ${offer.packSize}`) : '—'}
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    className="cf-input"
                    value={p.qtyStr}
                    disabled={!offer}
                    aria-label={`Quantité pour ${name}`}
                    onChange={(e) =>
                      onPatch(p.line.variantId, (cur) => ({ ...cur, qtyStr: e.target.value }))
                    }
                  />
                </td>
                <td>
                  {offer ? (
                    offer.unitCostCents === null ? (
                      <span className="cf-pill cf-pill--warn">prix inconnu</span>
                    ) : (
                      fmtEuros(offer.unitCostCents)
                    )
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
