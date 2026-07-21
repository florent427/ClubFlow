import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../components/ToastProvider';
import { ShopCheckoutModal } from '../components/shop/ShopCheckoutModal';
import { ConfirmModal } from '../components/ui';
import { formatEuroCents } from '../lib/format';
import {
  VIEWER_ADD_SHOP_CART_ITEM,
  VIEWER_CANCEL_SHOP_ORDER,
  VIEWER_CLEAR_SHOP_CART,
  VIEWER_REMOVE_SHOP_CART_ITEM,
  VIEWER_SET_SHOP_CART_ITEM_QUANTITY,
  VIEWER_SHOP_CART,
  VIEWER_SHOP_ORDERS,
  VIEWER_SHOP_PRODUCTS,
} from '../lib/viewer-documents';
import { canCheckout, countCartUnits, partitionCart } from '../lib/shop-cart';
import {
  canCancelOrder,
  canRepayOrder,
  orderStatusBadge,
} from '../lib/shop-order-actions';
import type {
  ViewerAddShopCartItemData,
  ViewerCancelShopOrderData,
  ViewerClearShopCartData,
  ViewerRemoveShopCartItemData,
  ViewerSetShopCartItemQuantityData,
  ViewerShopCart,
  ViewerShopCartData,
  ViewerShopOrder,
  ViewerShopOrdersData,
  ViewerShopProduct,
  ViewerShopProductsData,
  ViewerShopVariant,
} from '../lib/viewer-types';

const EMPTY_CART: ViewerShopCart = { id: '', totalCents: 0, items: [] };

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

/** Libellé affiché pour une déclinaison, jamais vide. */
function variantLabel(v: ViewerShopVariant): string {
  return v.label ?? 'Modèle unique';
}

/**
 * Déclinaison proposée par défaut : la première disponible, sinon la première
 * tout court. Choisir d'emblée une taille épuisée forcerait l'adhérent à
 * comprendre le sélecteur avant de pouvoir ajouter quoi que ce soit.
 */
function defaultVariantOf(p: ViewerShopProduct): ViewerShopVariant | null {
  return p.variants.find((v) => v.inStock) ?? p.variants[0] ?? null;
}

export function ShopPage() {
  const { showToast } = useToast();

  const { data: prodData, loading: prodLoading } =
    useQuery<ViewerShopProductsData>(VIEWER_SHOP_PRODUCTS, {
      fetchPolicy: 'cache-and-network',
    });
  const {
    data: cartData,
    loading: cartLoading,
    refetch: cartRefetch,
  } = useQuery<ViewerShopCartData>(VIEWER_SHOP_CART, {
    fetchPolicy: 'cache-and-network',
  });
  const { data: ordData, refetch: ordRefetch } = useQuery<ViewerShopOrdersData>(
    VIEWER_SHOP_ORDERS,
    { fetchPolicy: 'cache-and-network' },
  );

  /**
   * Le panier vit CÔTÉ SERVEUR (viewerShopCart). Chaque mutation renvoie le
   * panier complet et fait autorité : on garde donc le dernier état renvoyé en
   * local, et il l'emporte sur la requête initiale. Pas de plafond client sur
   * les quantités : le serveur arbitre la disponibilité (le type panier n'a
   * même pas de champ de stock à borner — confidentialité ADR-0012).
   */
  const [localCart, setLocalCart] = useState<ViewerShopCart | null>(null);
  const cart = localCart ?? cartData?.viewerShopCart ?? EMPTY_CART;

  // Retour de Stripe : la boutique ramène ici (et non sur Facturation, réservée
  // aux payeurs du foyer — un acheteur non-payeur y voyait « accès réservé »
  // APRÈS avoir payé). On confirme, on rafraîchit la commande et le panier
  // (vidé côté serveur au checkout), puis on nettoie l'URL.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const paid = searchParams.get('paid');
    const canceled = searchParams.get('canceled');
    if (paid === '1') {
      showToast('Paiement enregistré. Votre commande est confirmée.', 'success');
      setLocalCart(null);
      void cartRefetch();
      void ordRefetch();
    } else if (canceled === '1') {
      showToast('Paiement annulé. Votre panier est conservé.', 'info');
    }
    if (paid || canceled) {
      const next = new URLSearchParams(searchParams);
      next.delete('paid');
      next.delete('canceled');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, showToast, cartRefetch, ordRefetch]);

  const [addItem, { loading: adding }] = useMutation<ViewerAddShopCartItemData>(
    VIEWER_ADD_SHOP_CART_ITEM,
  );
  const [setItemQty, { loading: settingQty }] =
    useMutation<ViewerSetShopCartItemQuantityData>(
      VIEWER_SET_SHOP_CART_ITEM_QUANTITY,
    );
  const [removeItem, { loading: removing }] =
    useMutation<ViewerRemoveShopCartItemData>(VIEWER_REMOVE_SHOP_CART_ITEM);
  const [clearCart, { loading: clearing }] =
    useMutation<ViewerClearShopCartData>(VIEWER_CLEAR_SHOP_CART);
  const [cancelOrder, { loading: cancelling }] =
    useMutation<ViewerCancelShopOrderData>(VIEWER_CANCEL_SHOP_ORDER);

  const cartBusy = adding || settingQty || removing || clearing;

  /** Déclinaison choisie par produit. Vide = on retombe sur defaultVariantOf. */
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  /** Commande dont on reprend le paiement (ouvre la modale en mode repay). */
  const [repayOrder, setRepayOrder] = useState<ViewerShopOrder | null>(null);
  /** Commande en attente de confirmation d'annulation. */
  const [cancelTarget, setCancelTarget] = useState<ViewerShopOrder | null>(
    null,
  );

  const products = useMemo(
    () => prodData?.viewerShopProducts ?? [],
    [prodData],
  );
  const orders = ordData?.viewerShopOrders ?? [];

  const { unavailable } = useMemo(
    () => partitionCart(cart.items),
    [cart.items],
  );
  const unitCount = countCartUnits(cart.items);

  function pickVariant(productId: string, variantId: string) {
    setPicked((prev) => new Map(prev).set(productId, variantId));
  }

  async function onAddToCart(variantId: string, productName: string) {
    try {
      const res = await addItem({
        variables: { input: { variantId, quantity: 1 } },
      });
      if (res.data) setLocalCart(res.data.viewerAddShopCartItem);
      showToast(`${productName} ajouté au panier`, 'success');
    } catch (err) {
      // Message serveur tel quel (« Cet article est épuisé. », etc.).
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function onSetQty(itemId: string, quantity: number) {
    try {
      const res = await setItemQty({
        variables: { input: { itemId, quantity } },
      });
      if (res.data) setLocalCart(res.data.viewerSetShopCartItemQuantity);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function onRemove(itemId: string) {
    try {
      const res = await removeItem({ variables: { itemId } });
      if (res.data) setLocalCart(res.data.viewerRemoveShopCartItem);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function onClear() {
    try {
      const res = await clearCart();
      if (res.data) setLocalCart(res.data.viewerClearShopCart);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  /**
   * Annule la commande confirmée : le serveur libère le stock réservé et passe
   * la facture en VOID. On rafraîchit ensuite la liste des commandes pour
   * refléter le nouveau statut. Message serveur affiché tel quel en cas de
   * refus (ex. commande déjà payée).
   */
  async function onConfirmCancel() {
    const target = cancelTarget;
    if (!target) return;
    try {
      await cancelOrder({ variables: { orderId: target.id } });
      showToast('Commande annulée. Le stock a été libéré.', 'success');
      setCancelTarget(null);
      void ordRefetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
      setCancelTarget(null);
    }
  }

  return (
    <div className="mp-page">
      <header className="mp-page-header">
        <h1 className="mp-page-title">Boutique</h1>
        <p className="mp-page-subtitle">
          Ajoutez des articles à votre panier, puis réglez en ligne par carte.
        </p>
      </header>

      {prodLoading && products.length === 0 ? (
        <p className="mp-muted">Chargement…</p>
      ) : products.length === 0 ? (
        <p className="mp-muted">Aucun article disponible pour le moment.</p>
      ) : (
        <ul className="mp-product-list">
          {products.map((p) => {
            const fallback = defaultVariantOf(p);
            const pickedId = picked.get(p.id);
            const variant =
              (pickedId ? p.variants.find((v) => v.id === pickedId) : null) ??
              fallback;

            // Un produit actif dont toutes les déclinaisons ont été désactivées
            // n'a plus rien de vendable : pas d'identité à mettre au panier.
            if (!variant) {
              return (
                <li key={p.id} className="mp-product-card">
                  <div className="mp-product-card__body">
                    <h3 className="mp-product-card__name">{p.name}</h3>
                    <p className="mp-product-card__oos">Indisponible</p>
                  </div>
                </li>
              );
            }

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

                  {/* Sélecteur affiché UNIQUEMENT pour un produit à vraies
                      déclinaisons (ADR-0012 §1). */}
                  {p.hasVariants ? (
                    <label className="mp-product-card__variants">
                      <span className="mp-product-card__variants-label">
                        Déclinaison
                      </span>
                      <select
                        className="mp-input mp-product-card__variants-select"
                        value={variant.id}
                        onChange={(e) => pickVariant(p.id, e.target.value)}
                      >
                        {p.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {variantLabel(v)}
                            {v.inStock ? '' : ' — épuisé'}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {/* Prix de la déclinaison choisie (peut varier par taille). */}
                  <p className="mp-product-card__price">
                    {formatEuroCents(variant.unitPriceCents)}
                  </p>

                  {/* Ajout au panier via un BOUTON — jamais en modifiant une
                      quantité sur la grille. Désactivé si épuisé : la seule
                      info de stock connue du portail est le booléen `inStock`,
                      aucun compteur n'est exposé. */}
                  {!variant.inStock ? (
                    <p className="mp-product-card__oos">
                      {p.hasVariants
                        ? `${variantLabel(variant)} : épuisé`
                        : 'Rupture de stock'}
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="mp-btn mp-btn-primary mp-product-card__add"
                      disabled={adding}
                      onClick={() => void onAddToCart(variant.id, p.name)}
                    >
                      <span
                        className="material-symbols-outlined"
                        aria-hidden="true"
                      >
                        add_shopping_cart
                      </span>
                      Ajouter au panier
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {cart.items.length > 0 ? (
        <section className="mp-cart">
          <h2 className="mp-cart__title">
            Votre panier
            {unitCount > 0
              ? ` — ${unitCount} article${unitCount > 1 ? 's' : ''}`
              : ''}
          </h2>

          <ul className="mp-cart__lines">
            {cart.items.map((it) => (
              <li
                key={it.id}
                style={{
                  alignItems: 'center',
                  gap: 12,
                  opacity: it.unavailable ? 0.6 : 1,
                }}
              >
                <span style={{ flex: 1 }}>
                  <strong>{it.label}</strong>
                  {it.unavailable ? (
                    <span
                      className="mp-pill mp-pill--muted"
                      style={{ marginLeft: 8 }}
                    >
                      Indisponible
                    </span>
                  ) : !it.inStock ? (
                    <span
                      className="mp-pill mp-pill--warn"
                      style={{ marginLeft: 8 }}
                    >
                      Épuisé
                    </span>
                  ) : null}
                  <br />
                  <small className="mp-hint">
                    {formatEuroCents(it.unitPriceCents)} l'unité
                  </small>
                </span>

                {/* Sélecteur de quantité SANS plafond client : le « + » n'est
                    borné par aucun stock (le portail n'en connaît pas le
                    nombre) ; le serveur refuse au checkout si nécessaire. */}
                <span className="mp-product-card__qty" style={{ margin: 0 }}>
                  <button
                    type="button"
                    className="mp-qty-btn"
                    onClick={() => void onSetQty(it.id, it.quantity - 1)}
                    disabled={cartBusy || it.unavailable}
                    aria-label="Diminuer la quantité"
                  >
                    −
                  </button>
                  <span aria-live="polite">{it.quantity}</span>
                  <button
                    type="button"
                    className="mp-qty-btn"
                    onClick={() => void onSetQty(it.id, it.quantity + 1)}
                    disabled={cartBusy || it.unavailable}
                    aria-label="Augmenter la quantité"
                  >
                    +
                  </button>
                </span>

                <span style={{ minWidth: 72, textAlign: 'right' }}>
                  {formatEuroCents(it.lineTotalCents)}
                </span>

                <button
                  type="button"
                  className="mp-qty-btn"
                  onClick={() => void onRemove(it.id)}
                  disabled={cartBusy}
                  aria-label={`Retirer ${it.label}`}
                  title="Retirer"
                >
                  <span
                    className="material-symbols-outlined"
                    aria-hidden="true"
                    style={{ fontSize: '1.1rem' }}
                  >
                    delete
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {unavailable.length > 0 ? (
            <p className="mp-hint" style={{ marginTop: 0 }}>
              Les articles indisponibles ne sont pas facturés et ne peuvent pas
              partir au paiement. Retirez-les pour continuer.
            </p>
          ) : null}

          <div className="mp-cart__foot">
            <div>
              <button
                type="button"
                className="mp-btn mp-btn-outline"
                onClick={() => void onClear()}
                disabled={cartBusy}
              >
                Vider le panier
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <strong>Total : {formatEuroCents(cart.totalCents)}</strong>
              <button
                type="button"
                className="mp-btn mp-btn-primary"
                onClick={() => setCheckoutOpen(true)}
                disabled={cartBusy || !canCheckout(cart.items)}
              >
                Payer
              </button>
            </div>
          </div>
        </section>
      ) : cartLoading ? (
        <p className="mp-muted">Chargement du panier…</p>
      ) : null}

      <section className="mp-orders">
        <h2 className="mp-orders__title">Mes commandes</h2>
        {orders.length === 0 ? (
          <p className="mp-muted">Aucune commande pour le moment.</p>
        ) : (
          <ul className="mp-order-list">
            {orders.map((o) => {
              const pill = orderStatusBadge(o.status);
              const showActions =
                canRepayOrder(o.status) || canCancelOrder(o.status);
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
                        <span>
                          {formatEuroCents(l.unitPriceCents * l.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mp-order-card__total">
                    Total : {formatEuroCents(o.totalCents)}
                  </p>

                  {/* Actions réservées aux commandes EN ATTENTE : reprendre le
                      paiement (repay → Stripe) ou annuler (libère le stock).
                      Une commande payée ou annulée n'en propose aucune. */}
                  {showActions ? (
                    <div className="mp-order-card__actions">
                      {canRepayOrder(o.status) ? (
                        <button
                          type="button"
                          className="mp-btn mp-btn-primary"
                          disabled={cancelling}
                          onClick={() => setRepayOrder(o)}
                        >
                          <span
                            className="material-symbols-outlined"
                            aria-hidden="true"
                          >
                            credit_card
                          </span>
                          Payer
                        </button>
                      ) : null}
                      {canCancelOrder(o.status) ? (
                        <button
                          type="button"
                          className="mp-btn mp-btn-outline"
                          disabled={cancelling}
                          onClick={() => setCancelTarget(o)}
                        >
                          Annuler
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {checkoutOpen ? (
        <ShopCheckoutModal
          totalCents={cart.totalCents}
          onClose={() => {
            setCheckoutOpen(false);
            // Le checkout a pu échouer (rupture, 3× refusé) : on resynchronise
            // les commandes au cas où une réservation aurait bougé côté serveur.
            void ordRefetch();
          }}
        />
      ) : null}

      {/* Reprise de paiement d'une commande EN ATTENTE : même modale, en mode
          repay (prop `orderId`). Le retour Stripe `?paid=1`/`?canceled=1` est
          géré par l'effet en haut de page, identique au checkout panier. */}
      {repayOrder ? (
        <ShopCheckoutModal
          totalCents={repayOrder.totalCents}
          orderId={repayOrder.id}
          onClose={() => {
            setRepayOrder(null);
            void ordRefetch();
          }}
        />
      ) : null}

      <ConfirmModal
        open={cancelTarget !== null}
        title="Annuler cette commande ?"
        message="Les articles réservés seront remis en stock. Cette action est définitive ; vous pourrez recommander plus tard."
        confirmLabel="Annuler la commande"
        cancelLabel="Revenir"
        danger
        loading={cancelling}
        onConfirm={() => void onConfirmCancel()}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
