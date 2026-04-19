import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { useToast } from '../components/ToastProvider';
import {
  VIEWER_PLACE_SHOP_ORDER,
  VIEWER_SHOP_ORDERS,
  VIEWER_SHOP_PRODUCTS,
} from '../lib/viewer-documents';
import type {
  ViewerShopOrder,
  ViewerShopOrdersData,
  ViewerShopProductsData,
} from '../lib/viewer-types';

function fmtEuros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}
function statusLabel(s: ViewerShopOrder['status']): {
  label: string;
  cls: 'ok' | 'warn' | 'muted';
} {
  if (s === 'PAID') return { label: 'Payée', cls: 'ok' };
  if (s === 'CANCELLED') return { label: 'Annulée', cls: 'muted' };
  return { label: 'En attente', cls: 'warn' };
}

export function ShopPage() {
  const { showToast } = useToast();
  const { data: prodData, loading: prodLoading } =
    useQuery<ViewerShopProductsData>(VIEWER_SHOP_PRODUCTS, {
      fetchPolicy: 'cache-and-network',
    });
  const {
    data: ordData,
    refetch: ordRefetch,
  } = useQuery<ViewerShopOrdersData>(VIEWER_SHOP_ORDERS, {
    fetchPolicy: 'cache-and-network',
  });
  const [place, { loading: placing }] = useMutation(VIEWER_PLACE_SHOP_ORDER);

  const products = prodData?.viewerShopProducts ?? [];
  const orders = ordData?.viewerShopOrders ?? [];

  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [note, setNote] = useState('');

  const total = useMemo(() => {
    let sum = 0;
    for (const [pid, qty] of cart.entries()) {
      const p = products.find((x) => x.id === pid);
      if (p) sum += p.priceCents * qty;
    }
    return sum;
  }, [cart, products]);

  function setQty(productId: string, quantity: number) {
    setCart((prev) => {
      const next = new Map(prev);
      if (quantity <= 0) next.delete(productId);
      else next.set(productId, quantity);
      return next;
    });
  }

  async function onPlaceOrder() {
    const lines = Array.from(cart.entries()).map(([productId, quantity]) => ({
      productId,
      quantity,
    }));
    if (lines.length === 0) return;
    try {
      await place({
        variables: {
          input: { lines, note: note.trim() || undefined },
        },
      });
      showToast('Commande enregistrée', 'success');
      setCart(new Map());
      setNote('');
      await ordRefetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  return (
    <div className="mp-page">
      <header className="mp-page-header">
        <h1 className="mp-page-title">Boutique</h1>
        <p className="mp-page-subtitle">
          Commandez les articles proposés par votre club.
        </p>
      </header>

      {prodLoading && products.length === 0 ? (
        <p className="mp-muted">Chargement…</p>
      ) : products.length === 0 ? (
        <p className="mp-muted">Aucun article disponible pour le moment.</p>
      ) : (
        <ul className="mp-product-list">
          {products.map((p) => {
            const qty = cart.get(p.id) ?? 0;
            const max = p.stock ?? 99;
            const oos = p.stock !== null && p.stock <= 0;
            return (
              <li key={p.id} className="mp-product-card">
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt=""
                    className="mp-product-card__img"
                  />
                ) : null}
                <div className="mp-product-card__body">
                  <h3 className="mp-product-card__name">{p.name}</h3>
                  {p.description ? (
                    <p className="mp-product-card__desc">{p.description}</p>
                  ) : null}
                  <p className="mp-product-card__price">
                    {fmtEuros(p.priceCents)}
                  </p>
                  {oos ? (
                    <p className="mp-product-card__oos">Rupture de stock</p>
                  ) : (
                    <div className="mp-product-card__qty">
                      <button
                        type="button"
                        className="mp-qty-btn"
                        onClick={() => setQty(p.id, qty - 1)}
                        disabled={qty === 0}
                        aria-label="Retirer"
                      >
                        −
                      </button>
                      <span>{qty}</span>
                      <button
                        type="button"
                        className="mp-qty-btn"
                        onClick={() => setQty(p.id, Math.min(max, qty + 1))}
                        disabled={qty >= max}
                        aria-label="Ajouter"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {cart.size > 0 ? (
        <section className="mp-cart">
          <h2 className="mp-cart__title">Votre panier</h2>
          <ul className="mp-cart__lines">
            {Array.from(cart.entries()).map(([pid, qty]) => {
              const p = products.find((x) => x.id === pid);
              if (!p) return null;
              return (
                <li key={pid}>
                  <span>
                    {qty} × {p.name}
                  </span>
                  <span>{fmtEuros(p.priceCents * qty)}</span>
                </li>
              );
            })}
          </ul>
          <label className="mp-field">
            <span className="mp-field__label">Commentaire (optionnel)</span>
            <textarea
              className="mp-input mp-textarea"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
            />
          </label>
          <div className="mp-cart__foot">
            <strong>Total : {fmtEuros(total)}</strong>
            <button
              type="button"
              className="mp-btn mp-btn--primary"
              onClick={() => void onPlaceOrder()}
              disabled={placing}
            >
              Passer commande
            </button>
          </div>
        </section>
      ) : null}

      <section className="mp-orders">
        <h2 className="mp-orders__title">Mes commandes</h2>
        {orders.length === 0 ? (
          <p className="mp-muted">Aucune commande pour le moment.</p>
        ) : (
          <ul className="mp-order-list">
            {orders.map((o) => {
              const pill = statusLabel(o.status);
              return (
                <li key={o.id} className="mp-order-card">
                  <div className="mp-order-card__head">
                    <span>{fmtDate(o.createdAt)}</span>
                    <span className={`mp-pill mp-pill--${pill.cls}`}>
                      {pill.label}
                    </span>
                  </div>
                  <ul className="mp-order-lines">
                    {o.lines.map((l) => (
                      <li key={l.id}>
                        <span>
                          {l.quantity} × {l.label}
                        </span>
                        <span>{fmtEuros(l.unitPriceCents * l.quantity)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mp-order-card__total">
                    Total : {fmtEuros(o.totalCents)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
