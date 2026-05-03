import { useQuery } from '@apollo/client/react';
import { useOutletContext } from 'react-router-dom';
import { PUBLIC_CLUB_SHOP_PRODUCTS } from '../../lib/public-documents';
import type { PublicShopProductsQueryData } from '../../lib/public-types';

type Ctx = { slug: string; clubName: string };

function fmtEuros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

export function PublicShopPage() {
  const { slug } = useOutletContext<Ctx>();
  const { data, loading } = useQuery<PublicShopProductsQueryData>(
    PUBLIC_CLUB_SHOP_PRODUCTS,
    { variables: { clubSlug: slug } },
  );
  const products = data?.publicClubShopProducts ?? [];

  return (
    <div className="ps-page">
      <h1 className="ps-page-title">Boutique du club</h1>
      <p className="ps-muted">
        Les commandes sont réservées aux membres — <a href="/login">connectez-vous</a> pour acheter.
      </p>
      {loading && products.length === 0 ? (
        <p className="ps-muted">Chargement…</p>
      ) : products.length === 0 ? (
        <p className="ps-muted">Aucun article disponible.</p>
      ) : (
        <ul className="ps-shop-list">
          {products.map((p) => (
            <li key={p.id} className="ps-shop-card">
              {p.imageUrl ? (
                <img src={p.imageUrl} alt="" className="ps-shop-card__img" />
              ) : null}
              <h2>{p.name}</h2>
              {p.description ? (
                <p className="ps-shop-card__desc">{p.description}</p>
              ) : null}
              <p className="ps-shop-card__price">{fmtEuros(p.priceCents)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
