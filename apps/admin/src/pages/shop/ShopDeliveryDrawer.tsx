import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { SignatureField } from '../../components/SignatureField';
import { useToast } from '../../components/ToastProvider';
import { Drawer } from '../../components/ui';
import { DELIVER_SHOP_ORDER, SHOP_TERMS } from '../../lib/documents';
import { getClubId, getToken } from '../../lib/storage';
import type {
  DeliverShopOrderMutationData,
  ShopOrder,
  ShopTermsQueryData,
} from '../../lib/types';
import { fmtEuros } from './shop-format';

const API_ROOT = (
  (import.meta.env.VITE_GRAPHQL_HTTP as string | undefined) ??
  'http://localhost:3000/graphql'
).replace(/\/graphql\/?$/, '');

/**
 * Télécharge le bon de livraison PDF d'une commande remise. Le serveur le
 * produit à la demande et le réserve au back-office du club.
 */
export async function downloadDeliveryNote(orderId: string): Promise<void> {
  const token = getToken();
  const clubId = getClubId();
  const res = await fetch(`${API_ROOT}/shop/orders/${orderId}/delivery-note.pdf`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(clubId ? { 'x-club-id': clubId } : {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      message?: unknown;
    } | null;
    throw new Error(
      typeof body?.message === 'string'
        ? body.message
        : `Téléchargement impossible (HTTP ${res.status}).`,
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Bon_de_livraison_CMD-${orderId.slice(0, 8).toUpperCase()}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Remise d'une commande à l'adhérent (ADR-0017), pensée pour le téléphone de
 * l'admin : le tiroir passe en plein écran, la personne signe au doigt.
 *
 * La remise est permise avant paiement — elle sort alors le stock, et la
 * facture reste à encaisser. Si le club a des CGV et que la commande n'en porte
 * aucune acceptation (vente au comptoir), la signature la porte : l'écran le
 * dit à la personne avant qu'elle signe.
 */
export function ShopDeliveryDrawer({
  order,
  onClose,
  onDelivered,
}: {
  order: ShopOrder;
  onClose: () => void;
  onDelivered: () => void;
}) {
  const { showToast } = useToast();
  const buyer =
    `${order.buyerFirstName ?? ''} ${order.buyerLastName ?? ''}`.trim();
  const [signerName, setSignerName] = useState(buyer);
  const [signature, setSignature] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const { data: termsData } = useQuery<ShopTermsQueryData>(SHOP_TERMS, {
    fetchPolicy: 'cache-and-network',
  });
  const [deliver, { loading }] =
    useMutation<DeliverShopOrderMutationData>(DELIVER_SHOP_ORDER);

  const terms = termsData?.shopTerms ?? null;
  const signataire = signerName.trim();
  const canSubmit = !loading && signature !== null && signataire.length > 0;

  function close() {
    if (
      signature &&
      !window.confirm('Abandonner cette remise ? La signature sera perdue.')
    ) {
      return;
    }
    onClose();
  }

  async function onSubmit() {
    if (!signature || !signataire) return;
    setErreur(null);
    try {
      await deliver({
        variables: {
          input: {
            orderId: order.id,
            signerName: signataire,
            signaturePng: signature,
          },
        },
      });
      showToast('Remise enregistrée : le bon de livraison est disponible.', 'success');
      onDelivered();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Remise impossible.');
    }
  }

  return (
    <Drawer
      open
      title="Remise de la commande"
      onClose={close}
      footer={
        <div className="cf-form-actions">
          <button
            type="button"
            className="cf-btn"
            onClick={close}
            disabled={loading}
          >
            Annuler
          </button>
          <button
            type="button"
            className="cf-btn cf-btn--primary"
            onClick={() => void onSubmit()}
            disabled={!canSubmit}
          >
            {loading ? 'Enregistrement…' : 'Valider la remise'}
          </button>
        </div>
      }
    >
      <p style={{ marginTop: 0 }}>
        <strong>{buyer || '—'}</strong>
      </p>
      <ul className="cf-order-lines">
        {order.lines.map((l) => (
          <li key={l.id}>
            <span>
              {l.quantity} × {l.label}
            </span>
            <span>{fmtEuros(l.unitPriceCents * l.quantity)}</span>
          </li>
        ))}
      </ul>
      <p>
        <strong>Total : {fmtEuros(order.totalCents)}</strong>
      </p>
      {order.status === 'PAID' ? (
        <p className="cf-muted">Commande payée.</p>
      ) : (
        <div className="cf-alert cf-alert--info">
          <div className="cf-alert__content">
            <span>
              Commande pas encore payée : la remise sort les articles du stock,
              et la facture reste à encaisser.
            </span>
          </div>
        </div>
      )}

      <label className="cf-field">
        <span className="cf-field__label">Nom de la personne qui retire *</span>
        <input
          className="cf-input"
          value={signerName}
          maxLength={160}
          onChange={(e) => setSignerName(e.target.value)}
          disabled={loading}
        />
      </label>

      <p className="cf-field__hint">
        {terms && !order.termsAcceptedAt ? (
          <>
            En signant, {signataire || 'la personne'} reconnaît avoir reçu ces
            articles et accepte les{' '}
            <a href={terms.url} target="_blank" rel="noreferrer">
              conditions générales de vente
            </a>{' '}
            de la boutique.
          </>
        ) : (
          <>En signant, {signataire || 'la personne'} reconnaît avoir reçu ces articles.</>
        )}
      </p>

      <SignatureField onChange={setSignature} disabled={loading} />

      {erreur ? <p className="cf-error">{erreur}</p> : null}
    </Drawer>
  );
}
