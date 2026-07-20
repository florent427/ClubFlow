import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ADD_SHOP_PURCHASE_ORDER_LINE,
  CANCEL_SHOP_PURCHASE_ORDER,
  CLUB_ACCOUNTING_ENTRIES,
  CREATE_SHOP_PURCHASE_ORDER,
  LINK_SHOP_PURCHASE_ORDER_INVOICE,
  REMOVE_SHOP_PURCHASE_ORDER_LINE,
  SEND_SHOP_PURCHASE_ORDER,
  SHOP_LOW_STOCK_VARIANTS,
  SHOP_PRODUCTS,
  SHOP_PURCHASE_INVOICE_ACCOUNT,
  SHOP_PURCHASE_ORDERS,
  SHOP_SUPPLIERS,
  UNLINK_SHOP_PURCHASE_ORDER_INVOICE,
} from '../../lib/documents';
import type {
  AddShopPurchaseOrderLineMutationData,
  CancelShopPurchaseOrderMutationData,
  ClubAccountingEntriesData,
  CreateShopPurchaseOrderMutationData,
  LinkShopPurchaseOrderInvoiceMutationData,
  RemoveShopPurchaseOrderLineMutationData,
  SendShopPurchaseOrderMutationData,
  ShopProductsQueryData,
  ShopPurchaseInvoiceAccountQueryData,
  ShopPurchaseOrder,
  ShopPurchaseOrdersQueryData,
  ShopSuppliersQueryData,
  UnlinkShopPurchaseOrderInvoiceMutationData,
} from '../../lib/types';
import { useToast } from '../../components/ToastProvider';
import { ConfirmModal, Drawer, EmptyState } from '../../components/ui';
import { ReceptionDrawer } from './ReceptionDrawer';
import {
  discrepancyMeta,
  fmtDate,
  fmtDay,
  fmtEuros,
  purchaseStatusPill,
  variantDisplay,
} from './shop-format';

/** Les mutations d'appro qui bougent le stock périment aussi le catalogue. */
const STOCK_TOUCHING_REFETCH = [
  { query: SHOP_PURCHASE_ORDERS },
  { query: SHOP_PRODUCTS },
  { query: SHOP_LOW_STOCK_VARIANTS },
];

function parsePositiveInt(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/** « 12,50 » → 1250 centimes. `''` → 0, et c'est LE cas qu'on signale. */
function parseEurosToCents(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function PurchaseOrdersTab() {
  const { showToast } = useToast();
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, loading } = useQuery<ShopPurchaseOrdersQueryData>(
    SHOP_PURCHASE_ORDERS,
    { fetchPolicy: 'cache-and-network' },
  );
  const { data: suppliersData } = useQuery<ShopSuppliersQueryData>(
    SHOP_SUPPLIERS,
    { variables: { includeInactive: false }, fetchPolicy: 'cache-and-network' },
  );
  const { data: productsData } = useQuery<ShopProductsQueryData>(SHOP_PRODUCTS, {
    fetchPolicy: 'cache-first',
  });

  const [createOrder, { loading: creatingOrder }] =
    useMutation<CreateShopPurchaseOrderMutationData>(
      CREATE_SHOP_PURCHASE_ORDER,
    );

  const orders = data?.shopPurchaseOrders ?? [];
  const suppliers = suppliersData?.shopSuppliers ?? [];
  const products = useMemo(
    () => productsData?.shopProducts ?? [],
    [productsData],
  );

  // Les lignes ne portent qu'un identifiant de déclinaison ; le catalogue les
  // rend lisibles.
  const variantNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) {
      for (const v of p.variants) {
        map.set(v.id, variantDisplay(p.name, v.label));
      }
    }
    return map;
  }, [products]);

  const openOrder = orders.find((o) => o.id === openOrderId) ?? null;

  const [supplierId, setSupplierId] = useState('');
  const [orderNotes, setOrderNotes] = useState('');

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!supplierId) {
      showToast('Choisissez un fournisseur.', 'error');
      return;
    }
    try {
      const res = await createOrder({
        variables: {
          input: { supplierId, notes: orderNotes.trim() || null },
        },
        refetchQueries: [{ query: SHOP_PURCHASE_ORDERS }],
        awaitRefetchQueries: true,
      });
      const fresh = res.data?.createShopPurchaseOrder;
      showToast('Brouillon de commande créé', 'success');
      setCreating(false);
      setSupplierId('');
      setOrderNotes('');
      if (fresh) setOpenOrderId(fresh.id);
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
          disabled={suppliers.length === 0}
          onClick={() => setCreating(true)}
        >
          Nouvelle commande
        </button>
        {suppliers.length === 0 ? (
          <span className="cf-muted">
            Enregistrez d’abord un fournisseur dans l’onglet « Fournisseurs ».
          </span>
        ) : null}
      </div>

      {loading && orders.length === 0 ? (
        <p className="cf-muted">Chargement…</p>
      ) : orders.length === 0 ? (
        <EmptyState
          icon="receipt_long"
          title="Aucune commande fournisseur"
          message="Créez un brouillon, ajoutez les articles à commander, puis envoyez-le à votre fournisseur."
        />
      ) : (
        <div className="cf-variant-matrix">
          <table className="cf-data-table">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Fournisseur</th>
                <th>Statut</th>
                <th>Lignes</th>
                <th>Montant</th>
                <th>Envoyée</th>
                <th>Arrivée attendue</th>
                <th>Facture</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                // Le statut vient du SERVEUR (ADR-0013 §3). On le traduit,
                // on ne le recalcule jamais depuis les lignes : un statut
                // déduit ici contredirait un jour celui de la base.
                const pill = purchaseStatusPill(o.status);
                const totalCents = o.lines.reduce(
                  (acc, l) => acc + l.orderedQty * l.unitCostCents,
                  0,
                );
                const missingCost = o.lines.some(
                  (l) => l.unitCostCents === 0,
                );
                return (
                  <tr key={o.id}>
                    <td>
                      <strong>{o.reference}</strong>
                    </td>
                    <td>{o.supplier?.name ?? '—'}</td>
                    <td>
                      <span
                        className={`cf-pill cf-pill--${pill.cls}`}
                        title={pill.hint}
                      >
                        {pill.label}
                      </span>
                    </td>
                    <td>
                      {o.lines.length}
                      {o.lines.some((l) => !l.closed) ? (
                        <span className="cf-muted">
                          {' '}
                          ({o.lines.filter((l) => !l.closed).length} ouverte(s))
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {fmtEuros(totalCents)}
                      {missingCost ? (
                        <>
                          {' '}
                          <span
                            className="cf-pill cf-pill--warn"
                            title="Une ligne au prix d’achat 0 tire le coût moyen vers le bas et fausse la marge."
                          >
                            prix d’achat manquant
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td>{fmtDay(o.orderedAt)}</td>
                    <td>{fmtDay(o.expectedAt)}</td>
                    <td>
                      {o.accountingEntries.length === 0 ? (
                        <span className="cf-muted">—</span>
                      ) : (
                        <span className="cf-pill cf-pill--ok">
                          {o.accountingEntries.length} rapprochée(s)
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="cf-btn cf-btn--sm"
                        onClick={() => setOpenOrderId(o.id)}
                      >
                        Ouvrir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        open={creating}
        title="Nouvelle commande fournisseur"
        onClose={() => setCreating(false)}
      >
        <form onSubmit={(e) => void onCreate(e)} className="cf-form">
          <label className="cf-field">
            <span className="cf-field__label">Fournisseur</span>
            <select
              className="cf-input"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              required
            >
              <option value="">Choisir…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="cf-field">
            <span className="cf-field__label">Notes</span>
            <textarea
              className="cf-input"
              rows={3}
              maxLength={1000}
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
            />
          </label>
          <span className="cf-field__hint">
            La commande naît en <strong>brouillon</strong>, vide : vous
            ajoutez ses lignes ensuite, puis vous l’envoyez. Sa référence est
            engendrée par le système.
          </span>
          <div className="cf-form-actions">
            <button
              type="button"
              className="cf-btn"
              onClick={() => setCreating(false)}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="cf-btn cf-btn--primary"
              disabled={creatingOrder}
            >
              Créer le brouillon
            </button>
          </div>
        </form>
      </Drawer>

      {openOrder ? (
        <PurchaseOrderDrawer
          order={openOrder}
          variantNames={variantNames}
          products={products}
          onClose={() => setOpenOrderId(null)}
        />
      ) : null}
    </div>
  );
}

// ===========================================================================
// Le détail d'une commande : lignes, envoi, annulation, réception, facture
// ===========================================================================

function PurchaseOrderDrawer({
  order,
  variantNames,
  products,
  onClose,
}: {
  order: ShopPurchaseOrder;
  variantNames: Map<string, string>;
  products: ShopProductsQueryData['shopProducts'];
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [receiving, setReceiving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const [addLine, { loading: addingLine }] =
    useMutation<AddShopPurchaseOrderLineMutationData>(
      ADD_SHOP_PURCHASE_ORDER_LINE,
    );
  const [removeLine] = useMutation<RemoveShopPurchaseOrderLineMutationData>(
    REMOVE_SHOP_PURCHASE_ORDER_LINE,
  );
  const [sendOrder, { loading: sending }] =
    useMutation<SendShopPurchaseOrderMutationData>(SEND_SHOP_PURCHASE_ORDER);
  const [cancelOrder, { loading: cancelling }] =
    useMutation<CancelShopPurchaseOrderMutationData>(
      CANCEL_SHOP_PURCHASE_ORDER,
    );

  const [variantId, setVariantId] = useState('');
  const [qtyStr, setQtyStr] = useState('1');
  const [costStr, setCostStr] = useState('');

  const isDraft = order.status === 'DRAFT';
  const canReceive =
    order.status === 'ORDERED' || order.status === 'PARTIALLY_RECEIVED';
  const canCancel = isDraft || order.status === 'ORDERED';

  const pill = purchaseStatusPill(order.status);
  const totalCents = order.lines.reduce(
    (acc, l) => acc + l.orderedQty * l.unitCostCents,
    0,
  );
  const zeroCostLines = order.lines.filter((l) => l.unitCostCents === 0);

  async function onAddLine(e: FormEvent) {
    e.preventDefault();
    const qty = parsePositiveInt(qtyStr);
    if (!variantId) {
      showToast('Choisissez un article.', 'error');
      return;
    }
    if (qty === null) {
      showToast('Quantité invalide (au moins 1).', 'error');
      return;
    }
    const cents = parseEurosToCents(costStr);
    if (cents === null) {
      showToast('Prix d’achat invalide.', 'error');
      return;
    }
    try {
      await addLine({
        variables: {
          input: {
            orderId: order.id,
            variantId,
            orderedQty: qty,
            unitCostCents: cents,
          },
        },
        refetchQueries: [{ query: SHOP_PURCHASE_ORDERS }],
        awaitRefetchQueries: true,
      });
      showToast('Ligne ajoutée', 'success');
      setVariantId('');
      setQtyStr('1');
      setCostStr('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function onRemoveLine(lineId: string) {
    try {
      await removeLine({
        variables: { input: { orderId: order.id, lineId } },
        refetchQueries: [{ query: SHOP_PURCHASE_ORDERS }],
        awaitRefetchQueries: true,
      });
      showToast('Ligne retirée', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function onSend() {
    try {
      // L'envoi fait entrer les reliquats dans `onOrder` : le catalogue
      // change d'état au même instant, il ne peut pas rester en cache.
      await sendOrder({
        variables: { id: order.id },
        refetchQueries: STOCK_TOUCHING_REFETCH,
        awaitRefetchQueries: true,
      });
      showToast('Commande envoyée au fournisseur', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function onCancel() {
    try {
      await cancelOrder({
        variables: { id: order.id },
        refetchQueries: STOCK_TOUCHING_REFETCH,
        awaitRefetchQueries: true,
      });
      showToast('Commande annulée', 'success');
      setConfirmCancel(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
      setConfirmCancel(false);
    }
  }

  return (
    <Drawer
      open
      width={1000}
      title={`Commande ${order.reference}`}
      onClose={onClose}
    >
      <section className="cf-variant-section">
        <p>
          <strong>{order.supplier?.name ?? 'Fournisseur inconnu'}</strong>{' '}
          <span className={`cf-pill cf-pill--${pill.cls}`}>{pill.label}</span>
        </p>
        <p className="cf-muted">{pill.hint}</p>
        <p className="cf-muted">
          Envoyée : {fmtDay(order.orderedAt)} · Arrivée attendue :{' '}
          {fmtDay(order.expectedAt)} · Soldée : {fmtDay(order.closedAt)}
        </p>
        {order.notes ? <p>{order.notes}</p> : null}
        <div className="cf-toolbar">
          {isDraft ? (
            <button
              type="button"
              className="cf-btn cf-btn--primary"
              disabled={sending || order.lines.length === 0}
              onClick={() => void onSend()}
            >
              Envoyer au fournisseur
            </button>
          ) : null}
          {canReceive ? (
            <button
              type="button"
              className="cf-btn cf-btn--primary"
              onClick={() => setReceiving(true)}
            >
              Enregistrer une réception
            </button>
          ) : null}
          {canCancel ? (
            <button
              type="button"
              className="cf-btn cf-btn--danger"
              disabled={cancelling}
              onClick={() => setConfirmCancel(true)}
            >
              Annuler la commande
            </button>
          ) : null}
        </div>
      </section>

      <section className="cf-variant-section">
        <h3 className="cf-variant-section__title">
          Lignes ({order.lines.length}) — {fmtEuros(totalCents)}
        </h3>
        {zeroCostLines.length > 0 ? (
          /*
            Le prix d'achat est un champ qui COMPTE : laissé à zéro, il entre
            tel quel dans le coût moyen pondéré à la réception et le tire vers
            le bas — la marge affichée devient flatteuse et fausse. On le dit
            ici, pas dans les chiffres trois semaines plus tard.
          */
          <p className="cf-pill cf-pill--warn">
            {zeroCostLines.length} ligne(s) sans prix d’achat. À la réception,
            un prix de 0 entre tel quel dans le coût moyen de l’article : il
            l’écrase vers le bas et gonfle la marge affichée. Renseignez-le
            tant que la commande est modifiable.
          </p>
        ) : null}
        {order.lines.length === 0 ? (
          <p className="cf-muted">Aucune ligne pour l’instant.</p>
        ) : (
          <table className="cf-data-table">
            <thead>
              <tr>
                <th>Article</th>
                <th>Commandé</th>
                <th>Reçu</th>
                <th>Prix d’achat unitaire</th>
                <th>Total ligne</th>
                <th>État</th>
                {isDraft ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l) => (
                <tr key={l.id}>
                  <td>{variantNames.get(l.variantId) ?? l.variantId}</td>
                  <td>{l.orderedQty}</td>
                  <td>{l.receivedQty}</td>
                  <td>
                    {l.unitCostCents === 0 ? (
                      <span className="cf-pill cf-pill--warn">
                        non renseigné
                      </span>
                    ) : (
                      fmtEuros(l.unitCostCents)
                    )}
                  </td>
                  <td>{fmtEuros(l.orderedQty * l.unitCostCents)}</td>
                  <td>
                    {l.closed ? (
                      <span
                        className="cf-pill cf-pill--muted"
                        title="Plus rien n’est attendu sur cette ligne."
                      >
                        soldée
                      </span>
                    ) : (
                      <span className="cf-pill cf-pill--warn">
                        ouverte — reste{' '}
                        {Math.max(0, l.orderedQty - l.receivedQty)}
                      </span>
                    )}
                  </td>
                  {isDraft ? (
                    <td>
                      <button
                        type="button"
                        className="cf-btn cf-btn--sm cf-btn--danger"
                        onClick={() => void onRemoveLine(l.id)}
                      >
                        Retirer
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {isDraft ? (
          <form onSubmit={(e) => void onAddLine(e)} className="cf-form">
            <label className="cf-field">
              <span className="cf-field__label">Article à commander</span>
              <select
                className="cf-input"
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
              >
                <option value="">Choisir…</option>
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
            </label>
            <label className="cf-field">
              <span className="cf-field__label">Quantité</span>
              <input
                type="number"
                className="cf-input"
                min={1}
                value={qtyStr}
                onChange={(e) => setQtyStr(e.target.value)}
              />
            </label>
            <label className="cf-field">
              <span className="cf-field__label">
                Prix d’achat unitaire HT (€)
              </span>
              <input
                type="text"
                className="cf-input"
                inputMode="decimal"
                value={costStr}
                onChange={(e) => setCostStr(e.target.value)}
                placeholder="12,50"
              />
              <span className="cf-field__hint">
                Ce champ n’est pas décoratif : à la réception, il alimente le
                coût moyen pondéré de l’article, donc la marge et la valeur du
                stock. Laissé vide, il vaut <strong>0</strong> et tire le coût
                moyen vers le bas.
              </span>
            </label>
            <div className="cf-form-actions">
              <button
                type="submit"
                className="cf-btn cf-btn--primary"
                disabled={addingLine}
              >
                Ajouter la ligne
              </button>
            </div>
          </form>
        ) : (
          <p className="cf-field__hint">
            Les lignes ne se modifient plus une fois la commande envoyée.
          </p>
        )}
      </section>

      <ReceptionsHistory order={order} variantNames={variantNames} />

      <InvoiceReconciliation order={order} />

      {receiving ? (
        <ReceptionDrawer
          order={order}
          variantNames={variantNames}
          onClose={() => setReceiving(false)}
        />
      ) : null}

      <ConfirmModal
        open={confirmCancel}
        title="Annuler cette commande ?"
        message="Les lignes cesseront de compter dans l’encours fournisseur. Une commande déjà reçue ne peut pas être annulée."
        confirmLabel="Annuler la commande"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void onCancel()}
      />
    </Drawer>
  );
}

// ===========================================================================
// L'historique des livraisons — ce qui rend le journal précis (ADR-0013 §5)
// ===========================================================================

function ReceptionsHistory({
  order,
  variantNames,
}: {
  order: ShopPurchaseOrder;
  variantNames: Map<string, string>;
}) {
  const lineVariant = new Map(order.lines.map((l) => [l.id, l.variantId]));

  return (
    <section className="cf-variant-section">
      <h3 className="cf-variant-section__title">
        Livraisons ({order.receptions.length})
      </h3>
      {order.receptions.length === 0 ? (
        <p className="cf-muted">Aucune livraison enregistrée.</p>
      ) : (
        order.receptions.map((r) => (
          <div key={r.id} className="cf-variant-section">
            <p>
              <strong>{fmtDate(r.receivedAt)}</strong>
              {r.deliveryNote ? ` · BL ${r.deliveryNote}` : null}
            </p>
            {r.notes ? <p className="cf-muted">{r.notes}</p> : null}
            <table className="cf-data-table">
              <thead>
                <tr>
                  <th>Article</th>
                  <th>Reçu</th>
                  <th>Motif d’écart</th>
                  <th>Effet sur la ligne</th>
                </tr>
              </thead>
              <tbody>
                {r.lines.map((rl) => {
                  const vid = lineVariant.get(rl.orderLineId);
                  const meta = rl.discrepancyReason
                    ? discrepancyMeta(rl.discrepancyReason)
                    : null;
                  return (
                    <tr key={rl.id}>
                      <td>
                        {(vid ? variantNames.get(vid) : null) ?? '—'}
                      </td>
                      <td>{rl.receivedQty}</td>
                      <td>
                        {meta ? meta.label : <span className="cf-muted">—</span>}
                        {rl.discrepancyNote ? (
                          <div className="cf-muted">{rl.discrepancyNote}</div>
                        ) : null}
                      </td>
                      <td>
                        {meta ? (
                          <span
                            className={`cf-pill cf-pill--${
                              meta.keepsOpen ? 'warn' : 'muted'
                            }`}
                          >
                            {meta.keepsOpen
                              ? 'laissée ouverte'
                              : 'soldée'}
                          </span>
                        ) : (
                          <span className="cf-muted">conforme</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))
      )}
    </section>
  );
}

// ===========================================================================
// Rapprochement facture / commande (ADR-0013 §1)
//
// Aucune écriture n'est CRÉÉE ici : le grand livre est en trésorerie,
// l'écriture naît au paiement du fournisseur, côté comptabilité. On ne fait
// que poser — ou retirer — le lien.
// ===========================================================================

function InvoiceReconciliation({ order }: { order: ShopPurchaseOrder }) {
  const { showToast } = useToast();
  const [picking, setPicking] = useState(false);
  const [entryId, setEntryId] = useState('');

  const { data: accountData } = useQuery<ShopPurchaseInvoiceAccountQueryData>(
    SHOP_PURCHASE_INVOICE_ACCOUNT,
    { fetchPolicy: 'cache-first' },
  );
  const { data: entriesData, loading: entriesLoading } =
    useQuery<ClubAccountingEntriesData>(CLUB_ACCOUNTING_ENTRIES, {
      fetchPolicy: 'cache-and-network',
      skip: !picking,
    });

  const [link, { loading: linking }] =
    useMutation<LinkShopPurchaseOrderInvoiceMutationData>(
      LINK_SHOP_PURCHASE_ORDER_INVOICE,
    );
  const [unlink] = useMutation<UnlinkShopPurchaseOrderInvoiceMutationData>(
    UNLINK_SHOP_PURCHASE_ORDER_INVOICE,
  );

  const account = accountData?.shopPurchaseInvoiceAccount ?? null;
  const alreadyLinked = new Set(order.accountingEntries.map((e) => e.id));
  const candidates = (entriesData?.clubAccountingEntries ?? []).filter(
    (e) => e.kind === 'EXPENSE' && !alreadyLinked.has(e.id),
  );

  async function onLink(e: FormEvent) {
    e.preventDefault();
    if (!entryId) {
      showToast('Choisissez une écriture à rapprocher.', 'error');
      return;
    }
    try {
      await link({
        variables: { input: { orderId: order.id, entryId } },
        refetchQueries: [{ query: SHOP_PURCHASE_ORDERS }],
        awaitRefetchQueries: true,
      });
      showToast('Facture rapprochée', 'success');
      setPicking(false);
      setEntryId('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function onUnlink(id: string) {
    try {
      await unlink({
        variables: { input: { orderId: order.id, entryId: id } },
        refetchQueries: [{ query: SHOP_PURCHASE_ORDERS }],
        awaitRefetchQueries: true,
      });
      showToast('Facture détachée — l’écriture comptable est intacte', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  return (
    <section className="cf-variant-section">
      <h3 className="cf-variant-section__title">
        Factures fournisseur rapprochées ({order.accountingEntries.length})
      </h3>
      <p className="cf-muted">
        La réception n’écrit rien en comptabilité : l’écriture naît au
        <strong> paiement </strong>
        du fournisseur, et se saisit dans le module Comptabilité
        {account ? ` — le compte ${account.code} ${account.label} y est proposé par défaut` : null}
        . Le rapprochement ne fait que <strong>relier</strong> une écriture
        déjà saisie à cette commande.
      </p>

      {order.accountingEntries.length === 0 ? (
        <p className="cf-muted">Aucune facture rapprochée.</p>
      ) : (
        <table className="cf-data-table">
          <thead>
            <tr>
              <th>Libellé</th>
              <th>N° facture</th>
              <th>Montant</th>
              <th>Date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {order.accountingEntries.map((e) => (
              <tr key={e.id}>
                <td>{e.label}</td>
                <td>{e.invoiceNumber ?? '—'}</td>
                <td>{fmtEuros(e.amountCents)}</td>
                <td>{fmtDay(e.occurredAt)}</td>
                <td>
                  <button
                    type="button"
                    className="cf-btn cf-btn--sm"
                    onClick={() => void onUnlink(e.id)}
                  >
                    Détacher
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {picking ? (
        <form onSubmit={(e) => void onLink(e)} className="cf-form">
          <label className="cf-field">
            <span className="cf-field__label">
              Écriture de dépense à rapprocher
            </span>
            <select
              className="cf-input"
              value={entryId}
              onChange={(e) => setEntryId(e.target.value)}
            >
              <option value="">
                {entriesLoading ? 'Chargement…' : 'Choisir…'}
              </option>
              {candidates.map((e) => (
                <option key={e.id} value={e.id}>
                  {fmtDay(e.occurredAt)} — {e.label} —{' '}
                  {fmtEuros(e.amountCents)}
                  {e.invoiceNumber ? ` (${e.invoiceNumber})` : ''}
                </option>
              ))}
            </select>
            <span className="cf-field__hint">
              Seules les écritures de dépense de la période courante sont
              proposées. Si la vôtre n’y figure pas, saisissez-la d’abord dans
              le module Comptabilité.
            </span>
          </label>
          <div className="cf-form-actions">
            <button
              type="button"
              className="cf-btn"
              onClick={() => setPicking(false)}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="cf-btn cf-btn--primary"
              disabled={linking}
            >
              Rapprocher
            </button>
          </div>
        </form>
      ) : (
        <div className="cf-toolbar">
          <button
            type="button"
            className="cf-btn"
            onClick={() => setPicking(true)}
          >
            Rapprocher une facture
          </button>
        </div>
      )}
    </section>
  );
}
