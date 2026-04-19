import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CANCEL_SHOP_ORDER,
  CREATE_SHOP_PRODUCT,
  DELETE_SHOP_PRODUCT,
  MARK_SHOP_ORDER_PAID,
  SHOP_ORDERS,
  SHOP_PRODUCTS,
  UPDATE_SHOP_PRODUCT,
} from '../../lib/documents';
import type {
  ShopOrder,
  ShopOrdersQueryData,
  ShopProduct,
  ShopProductsQueryData,
} from '../../lib/types';
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

function ProductsTab() {
  const { showToast } = useToast();
  const { data, refetch, loading } = useQuery<ShopProductsQueryData>(
    SHOP_PRODUCTS,
    { fetchPolicy: 'cache-and-network' },
  );
  const [create, { loading: creating }] = useMutation(CREATE_SHOP_PRODUCT);
  const [update, { loading: updating }] = useMutation(UPDATE_SHOP_PRODUCT);
  const [remove] = useMutation(DELETE_SHOP_PRODUCT);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ShopProduct | null>(null);
  const [confirmDel, setConfirmDel] = useState<ShopProduct | null>(null);

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [priceEuros, setPriceEuros] = useState('');
  const [stockStr, setStockStr] = useState('');
  const [active, setActive] = useState(true);

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
      if (editing) {
        await update({
          variables: {
            input: {
              id: editing.id,
              name: name.trim(),
              sku: sku.trim() || undefined,
              description: description.trim() || undefined,
              imageUrl: imageUrl.trim() || undefined,
              priceCents,
              stock: stockValue,
              active,
            },
          },
        });
        showToast('Produit mis à jour', 'success');
      } else {
        await create({
          variables: {
            input: {
              name: name.trim(),
              sku: sku.trim() || undefined,
              description: description.trim() || undefined,
              imageUrl: imageUrl.trim() || undefined,
              priceCents,
              stock: stockValue,
              active,
            },
          },
        });
        showToast('Produit créé', 'success');
      }
      setDrawerOpen(false);
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
                <p className="cf-product-card__stock">
                  {p.stock === null ? 'Stock illimité' : `${p.stock} en stock`}
                </p>
                <div className="cf-product-card__actions">
                  <button
                    type="button"
                    className="cf-btn"
                    onClick={() => openEdit(p)}
                  >
                    Modifier
                  </button>
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
          </div>
          <label className="cf-checkbox">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <span>Produit actif (visible par les membres)</span>
          </label>
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

export function ShopPage() {
  const [tab, setTab] = useState<'products' | 'orders'>('products');
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
        <button
          type="button"
          className={`cf-tab${tab === 'products' ? ' cf-tab--active' : ''}`}
          onClick={() => setTab('products')}
        >
          Produits
        </button>
        <button
          type="button"
          className={`cf-tab${tab === 'orders' ? ' cf-tab--active' : ''}`}
          onClick={() => setTab('orders')}
        >
          Commandes
        </button>
      </div>
      {tab === 'products' ? <ProductsTab /> : <OrdersTab />}
    </div>
  );
}
