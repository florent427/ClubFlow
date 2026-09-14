import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { SignatureField } from '../../components/SignatureField';
import { useToast } from '../../components/ToastProvider';
import { Drawer } from '../../components/ui';
import {
  CREATE_SHOP_DELIVERY_NOTE_LINK,
  DELIVER_SHOP_ORDER,
  SEND_SHOP_DELIVERY_NOTE,
  SHOP_TERMS,
} from '../../lib/documents';
import type {
  CreateShopDeliveryNoteLinkMutationData,
  DeliverShopOrderMutationData,
  SendShopDeliveryNoteMutationData,
  ShopOrder,
  ShopTermsQueryData,
} from '../../lib/types';
import { fmtEuros } from './shop-format';

/** Adresse plausible — la même règle que le serveur. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Ouvre le bon de livraison dans un nouvel onglet, où le navigateur propose
 * lui-même d'enregistrer, d'imprimer ou de partager le PDF.
 *
 * L'onglet est ouvert AVANT tout appel réseau, pendant le clic. Ouvert après
 * un `await`, il est bloqué sans un mot par Safari et par les navigateurs
 * mobiles — et un lien `download` cliqué par programme sur un Blob l'est tout
 * autant : c'est ce qui laissait « Bon de livraison » sans effet. Le serveur
 * rend ensuite un lien signé et court, que l'onglet ouvre sans en-tête.
 */
export function useOpenDeliveryNote(): (orderId: string) => Promise<void> {
  const [createLink] = useMutation<CreateShopDeliveryNoteLinkMutationData>(
    CREATE_SHOP_DELIVERY_NOTE_LINK,
  );
  return async (orderId: string) => {
    const onglet = window.open('', '_blank');
    try {
      const { data } = await createLink({ variables: { orderId } });
      const url = data?.createShopDeliveryNoteLink;
      if (!url) throw new Error('Lien du bon de livraison indisponible.');
      if (onglet) onglet.location.href = url;
      else window.location.assign(url);
    } catch (err) {
      onglet?.close();
      throw err;
    }
  };
}

/**
 * Remise d'une commande à l'adhérent (ADR-0017), pensée pour le téléphone de
 * l'admin : le tiroir passe en plein écran, la personne signe au doigt.
 *
 * La remise est permise avant paiement — elle sort alors le stock, et la
 * facture reste à encaisser. Si le club a des CGV et que la commande n'en porte
 * aucune acceptation (vente au comptoir), la signature la porte : l'écran le
 * dit à la personne avant qu'elle signe. Le bon peut partir par e-mail dans la
 * foulée.
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
  const [envoyerParMail, setEnvoyerParMail] = useState(Boolean(order.buyerEmail));
  const [email, setEmail] = useState(order.buyerEmail ?? '');
  const [erreur, setErreur] = useState<string | null>(null);
  const { data: termsData } = useQuery<ShopTermsQueryData>(SHOP_TERMS, {
    fetchPolicy: 'cache-and-network',
  });
  const [deliver, { loading: delivering }] =
    useMutation<DeliverShopOrderMutationData>(DELIVER_SHOP_ORDER);
  const [sendNote, { loading: sending }] =
    useMutation<SendShopDeliveryNoteMutationData>(SEND_SHOP_DELIVERY_NOTE);

  const loading = delivering || sending;
  const terms = termsData?.shopTerms ?? null;
  const signataire = signerName.trim();
  const adresse = email.trim();
  const adresseOk = !envoyerParMail || EMAIL.test(adresse);
  const canSubmit =
    !loading && signature !== null && signataire.length > 0 && adresseOk;

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
    if (!signature || !signataire || !adresseOk) return;
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
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Remise impossible.');
      return;
    }

    // La remise est enregistrée : un échec de l'envoi ne l'annule pas, il se
    // rattrape depuis la commande (« Envoyer par e-mail »).
    if (envoyerParMail) {
      try {
        const { data } = await sendNote({
          variables: { input: { orderId: order.id, email: adresse } },
        });
        showToast(
          `Remise enregistrée. Bon de livraison envoyé à ${data?.sendShopDeliveryNote ?? adresse}.`,
          'success',
        );
      } catch (e) {
        showToast(
          `Remise enregistrée, mais l’envoi du bon a échoué : ${
            e instanceof Error ? e.message : 'erreur inconnue'
          }. Renvoyez-le depuis la commande.`,
          'error',
        );
      }
    } else {
      showToast('Remise enregistrée : le bon de livraison est disponible.', 'success');
    }
    onDelivered();
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
            {delivering
              ? 'Enregistrement…'
              : sending
                ? 'Envoi du bon…'
                : 'Valider la remise'}
          </button>
        </div>
      }
    >
      <p style={{ marginTop: 0 }}>
        <strong>{buyer || '—'}</strong>
      </p>
      <ul className="cf-order-lines">
        {order.lines
          // Les articles retirés de la commande ne sont pas remis (ADR-0020).
          .filter((l) => l.quantity - l.cancelledQty > 0)
          .map((l) => (
            <li key={l.id}>
              <span>
                {l.quantity - l.cancelledQty} × {l.label}
              </span>
              <span>
                {fmtEuros(l.unitPriceCents * (l.quantity - l.cancelledQty))}
              </span>
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

      <label
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}
      >
        <input
          type="checkbox"
          checked={envoyerParMail}
          onChange={(e) => setEnvoyerParMail(e.target.checked)}
          disabled={loading}
        />
        <span>Envoyer le bon de livraison par e-mail</span>
      </label>
      {envoyerParMail ? (
        <label className="cf-field">
          <span className="cf-field__label">Adresse e-mail *</span>
          <input
            className="cf-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="adresse de la personne"
            disabled={loading}
          />
          {!adresseOk && adresse.length > 0 ? (
            <small className="cf-error">Adresse e-mail invalide.</small>
          ) : null}
        </label>
      ) : null}

      {erreur ? <p className="cf-error">{erreur}</p> : null}
    </Drawer>
  );
}

/**
 * Envoi du bon de livraison par e-mail, depuis une commande déjà remise : à
 * l'adresse de l'acheteur, ou à celle d'un parent.
 */
export function ShopDeliveryNoteMailDrawer({
  order,
  onClose,
}: {
  order: ShopOrder;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [email, setEmail] = useState(order.buyerEmail ?? '');
  const [erreur, setErreur] = useState<string | null>(null);
  const [send, { loading }] =
    useMutation<SendShopDeliveryNoteMutationData>(SEND_SHOP_DELIVERY_NOTE);
  const adresse = email.trim();

  async function onSubmit() {
    setErreur(null);
    try {
      const { data } = await send({
        variables: { input: { orderId: order.id, email: adresse } },
      });
      showToast(
        `Bon de livraison envoyé à ${data?.sendShopDeliveryNote ?? adresse}.`,
        'success',
      );
      onClose();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Envoi impossible.');
    }
  }

  return (
    <Drawer
      open
      title="Envoyer le bon de livraison"
      onClose={onClose}
      footer={
        <div className="cf-form-actions">
          <button
            type="button"
            className="cf-btn"
            onClick={onClose}
            disabled={loading}
          >
            Annuler
          </button>
          <button
            type="button"
            className="cf-btn cf-btn--primary"
            onClick={() => void onSubmit()}
            disabled={loading || !EMAIL.test(adresse)}
          >
            {loading ? 'Envoi…' : 'Envoyer'}
          </button>
        </div>
      }
    >
      <p className="cf-field__hint" style={{ marginTop: 0 }}>
        Le bon de livraison signé part en pièce jointe (PDF).
      </p>
      <label className="cf-field">
        <span className="cf-field__label">Adresse e-mail *</span>
        <input
          className="cf-input"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="adresse de la personne"
          disabled={loading}
        />
      </label>
      {erreur ? <p className="cf-error">{erreur}</p> : null}
    </Drawer>
  );
}
