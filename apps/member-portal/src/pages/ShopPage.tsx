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
  ViewerShopProduct,
  ViewerShopProductsData,
  ViewerShopVariant,
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

/** Libellé affiché pour une déclinaison, jamais vide. */
function variantLabel(v: ViewerShopVariant): string {
  return v.label ?? 'Modèle unique';
}

/**
 * Déclinaison proposée par défaut : la première disponible, sinon la première
 * tout court. Choisir d'emblée une taille épuisée forcerait l'adhérent à
 * comprendre le sélecteur avant de pouvoir acheter quoi que ce soit.
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
    data: ordData,
    refetch: ordRefetch,
  } = useQuery<ViewerShopOrdersData>(VIEWER_SHOP_ORDERS, {
    fetchPolicy: 'cache-and-network',
  });
  const [place, { loading: placing }] = useMutation(VIEWER_PLACE_SHOP_ORDER);

  // Mémoïsé : le `?? []` fabriquerait un tableau neuf à chaque rendu, donc
  // reconstruirait l'index des déclinaisons et le total pour rien.
  const products = useMemo(
    () => prodData?.viewerShopProducts ?? [],
    [prodData],
  );
  const orders = ordData?.viewerShopOrders ?? [];

  /**
   * Le panier est indexé par DÉCLINAISON, pas par produit (ADR-0012) : c'est
   * la déclinaison qui porte le prix et le stock, et deux tailles du même
   * t-shirt sont deux lignes distinctes. Volatile et non persisté — rien à
   * migrer, un rechargement le vide comme avant.
   */
  const [cart, setCart] = useState<Map<string, number>>(new Map());
  /** Déclinaison choisie par produit. Vide = on retombe sur `defaultVariantOf`. */
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  const [note, setNote] = useState('');

  /**
   * Index déclinaison → (produit, déclinaison). C'est LE point de résolution
   * du panier : le total, l'affichage des lignes et l'envoi de la commande le
   * partagent, donc ils ne peuvent plus diverger.
   */
  const byVariantId = useMemo(() => {
    const idx = new Map<
      string,
      { product: ViewerShopProduct; variant: ViewerShopVariant }
    >();
    for (const product of products) {
      for (const variant of product.variants) {
        idx.set(variant.id, { product, variant });
      }
    }
    return idx;
  }, [products]);

  const total = useMemo(() => {
    let sum = 0;
    for (const [variantId, qty] of cart.entries()) {
      const hit = byVariantId.get(variantId);
      if (hit) sum += hit.variant.unitPriceCents * qty;
    }
    return sum;
  }, [cart, byVariantId]);

  function setQty(variantId: string, quantity: number) {
    setCart((prev) => {
      const next = new Map(prev);
      if (quantity <= 0) next.delete(variantId);
      else next.set(variantId, quantity);
      return next;
    });
  }

  function pickVariant(productId: string, variantId: string) {
    setPicked((prev) => new Map(prev).set(productId, variantId));
  }

  async function onPlaceOrder() {
    // Une déclinaison disparue du catalogue entre l'ajout au panier et la
    // validation ne part pas au serveur : on ne lui envoie que ce qu'on sait
    // encore résoudre.
    const lines = Array.from(cart.entries())
      .filter(([variantId]) => byVariantId.has(variantId))
      .map(([variantId, quantity]) => ({ variantId, quantity }));
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
            const fallback = defaultVariantOf(p);
            const pickedId = picked.get(p.id);
            const variant =
              (pickedId ? p.variants.find((v) => v.id === pickedId) : null) ??
              fallback;

            // Un produit actif dont toutes les déclinaisons ont été
            // désactivées n'a plus rien de vendable : il n'y a pas d'identité
            // à mettre dans le panier.
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

            const qty = cart.get(variant.id) ?? 0;

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

                  {/* Le sélecteur n'apparaît QUE pour un produit qui a de
                      vraies déclinaisons. Un porte-clés reste exactement la
                      carte d'avant (ADR-0012 §1). */}
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

                  {/* Le prix affiché est celui de la déclinaison choisie : il
                      peut varier d'une taille à l'autre (ADR-0012 §6). */}
                  <p className="mp-product-card__price">
                    {fmtEuros(variant.unitPriceCents)}
                  </p>

                  {!variant.inStock ? (
                    <p className="mp-product-card__oos">
                      {p.hasVariants
                        ? `${variantLabel(variant)} : épuisé`
                        : 'Rupture de stock'}
                    </p>
                  ) : (
                    <div className="mp-product-card__qty">
                      <button
                        type="button"
                        className="mp-qty-btn"
                        onClick={() => setQty(variant.id, qty - 1)}
                        disabled={qty === 0}
                        aria-label="Retirer"
                      >
                        −
                      </button>
                      <span>{qty}</span>
                      {/* Le « + » est borné par la SEULE disponibilité que le
                          portail connaisse : `inStock`. Quand il est faux,
                          c'est ce bloc entier qui disparaît au profit du
                          message d'épuisement — d'où l'absence de plafond
                          numérique ici. L'ancien `p.stock ?? 99` ne bornait
                          rien (99 est arbitraire) et exposait un compteur que
                          l'adhérent ne doit pas voir ; le vrai plafond est
                          tenu par le `updateMany` conditionnel du serveur, qui
                          refuse la commande et renvoie l'erreur affichée en
                          toast. */}
                      <button
                        type="button"
                        className="mp-qty-btn"
                        onClick={() => setQty(variant.id, qty + 1)}
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
            {Array.from(cart.entries()).map(([variantId, qty]) => {
              const hit = byVariantId.get(variantId);
              if (!hit) return null;
              const { product, variant } = hit;
              return (
                <li key={variantId}>
                  <span>
                    {qty} × {product.name}
                    {product.hasVariants ? ` — ${variantLabel(variant)}` : ''}
                  </span>
                  <span>{fmtEuros(variant.unitPriceCents * qty)}</span>
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
                    {/* `label` a figé le libellé (déclinaison comprise) à la
                        commande : l'historique reste juste même si le produit
                        est renommé ou la déclinaison supprimée. */}
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
