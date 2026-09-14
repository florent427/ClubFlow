import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { SignatureField } from '../../components/SignatureField';
import { useToast } from '../../components/ToastProvider';
import { Drawer } from '../../components/ui';
import {
  ADJUST_SHOP_ORDER_LINE,
  CREATE_SHOP_EXCHANGE_NOTE_LINK,
  SEND_SHOP_EXCHANGE_NOTE,
  SHOP_ORDER_LINE_ADJUSTMENT_PREVIEW,
  SHOP_PRODUCTS,
} from '../../lib/documents';
import {
  activeQty,
  adjustFormError,
  adjustmentGoodsLines,
  adjustmentMoneyLines,
  adjustmentToast,
  exchangeChoiceLabel,
  exchangeChoices,
} from '../../lib/shop-order-adjustment';
import type {
  AdjustShopOrderLineMutationData,
  CreateShopExchangeNoteLinkMutationData,
  SendShopExchangeNoteMutationData,
  ShopOrder,
  ShopOrderLine,
  ShopOrderLineAdjustmentPreviewQueryData,
  ShopProductsQueryData,
} from '../../lib/types';
import { fmtEuros } from './shop-format';

/** Adresse plausible — la même règle que le serveur. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Ouvre le bon d'échange dans un nouvel onglet — ouvert pendant le clic, avant
 * tout appel réseau, comme le bon de livraison (cf. `useOpenDeliveryNote`).
 */
export function useOpenExchangeNote(): (adjustmentId: string) => Promise<void> {
  const [createLink] = useMutation<CreateShopExchangeNoteLinkMutationData>(
    CREATE_SHOP_EXCHANGE_NOTE_LINK,
  );
  return async (adjustmentId: string) => {
    const onglet = window.open('', '_blank');
    try {
      const { data } = await createLink({ variables: { adjustmentId } });
      const url = data?.createShopExchangeNoteLink;
      if (!url) throw new Error('Lien du bon d’échange indisponible.');
      if (onglet) onglet.location.href = url;
      else window.location.assign(url);
    } catch (err) {
      onglet?.close();
      throw err;
    }
  };
}

/**
 * Annuler ou échanger des articles d'une ligne de commande (ADR-0020).
 *
 * Avant de confirmer, l'admin voit la différence et ce qu'elle devient —
 * rendue par le moyen de chaque encaissement, éteinte par avoir, ou facturée à
 * part —, et ce que devient la marchandise. Une commande déjà remise exige
 * l'article rapporté, et l'échange se signe sur le téléphone de l'admin : le
 * bon de livraison d'origine reste tel qu'il a été signé, un bon d'échange est
 * produit. Le serveur exécute le plan affiché.
 */
export function ShopOrderAdjustDrawer({
  order,
  line,
  mode,
  onClose,
  onDone,
}: {
  order: ShopOrder;
  line: ShopOrderLine;
  mode: 'CANCEL' | 'EXCHANGE';
  onClose: () => void;
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const exchange = mode === 'EXCHANGE';
  const restant = activeQty(line);
  const buyer =
    `${order.buyerFirstName ?? ''} ${order.buyerLastName ?? ''}`.trim();
  /** Sortie du stock (ADR-0017) : l'article rendu revient, ou est perdu. */
  const exited = order.status === 'PAID' || order.fulfilledAt !== null;
  const delivered = order.deliveredAt !== null;
  const signatureNeeded = exchange && delivered;

  const [qtyStr, setQtyStr] = useState('1');
  const [newVariantId, setNewVariantId] = useState('');
  const [newQtyStr, setNewQtyStr] = useState('');
  const [goodsReturned, setGoodsReturned] = useState(false);
  const [goodsLost, setGoodsLost] = useState(false);
  const [reason, setReason] = useState('');
  const [signerName, setSignerName] = useState(buyer);
  const [signature, setSignature] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const qty = Number.parseInt(qtyStr, 10);
  const qtyOk = Number.isInteger(qty) && qty >= 1 && qty <= restant;
  const newQty = newQtyStr.trim() === '' ? qty : Number.parseInt(newQtyStr, 10);
  const newQtyOk = !exchange || (Number.isInteger(newQty) && newQty >= 1);
  const ready = qtyOk && newQtyOk && (!exchange || newVariantId !== '');

  const { data: productsData } = useQuery<ShopProductsQueryData>(SHOP_PRODUCTS, {
    skip: !exchange,
    fetchPolicy: 'cache-and-network',
  });
  const choices = useMemo(
    () => exchangeChoices(productsData?.shopProducts ?? []),
    [productsData],
  );

  const input = {
    orderId: order.id,
    lineId: line.id,
    quantity: qty,
    newVariantId: exchange ? newVariantId : null,
    newQuantity: exchange ? newQty : null,
    goodsReturned,
    goodsLost,
  };
  const {
    data,
    loading: previewLoading,
    error: previewError,
  } = useQuery<ShopOrderLineAdjustmentPreviewQueryData>(
    SHOP_ORDER_LINE_ADJUSTMENT_PREVIEW,
    { variables: { input }, skip: !ready, fetchPolicy: 'network-only' },
  );
  const [adjust, { loading }] = useMutation<AdjustShopOrderLineMutationData>(
    ADJUST_SHOP_ORDER_LINE,
  );

  const preview = ready ? (data?.shopOrderLineAdjustmentPreview ?? null) : null;
  const formError = preview
    ? adjustFormError(preview, { reason, goodsReturned, signerName, signature })
    : null;
  const canSubmit =
    preview !== null && !previewLoading && !loading && formError === null;

  function close() {
    if (
      signature &&
      !window.confirm('Abandonner cet échange ? La signature sera perdue.')
    ) {
      return;
    }
    onClose();
  }

  async function onSubmit() {
    if (!canSubmit || !preview) return;
    setErreur(null);
    try {
      const { data: res } = await adjust({
        variables: {
          input: {
            ...input,
            reason: reason.trim(),
            signerName: preview.signatureRequired ? signerName.trim() : null,
            signaturePng: preview.signatureRequired ? signature : null,
          },
        },
      });
      if (res) {
        const toast = adjustmentToast(res.adjustShopOrderLine, exchange);
        showToast(toast.message, toast.tone);
      }
      onDone();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  }

  return (
    <Drawer
      open
      title={exchange ? 'Échanger un article' : 'Annuler un article'}
      onClose={close}
      footer={
        <div className="cf-form-actions">
          <button
            type="button"
            className="cf-btn"
            onClick={close}
            disabled={loading}
          >
            Retour
          </button>
          <button
            type="button"
            className={exchange ? 'cf-btn cf-btn--primary' : 'cf-btn cf-btn--danger'}
            onClick={() => void onSubmit()}
            disabled={!canSubmit}
          >
            {loading
              ? 'Enregistrement…'
              : exchange
                ? 'Confirmer l’échange'
                : 'Confirmer l’annulation'}
          </button>
        </div>
      }
    >
      <p style={{ marginTop: 0 }}>
        <strong>{buyer || '—'}</strong> · {restant} × {line.label} ·{' '}
        {fmtEuros(line.unitPriceCents)} l’unité
      </p>

      {restant > 1 ? (
        <label className="cf-field">
          <span className="cf-field__label">
            {exchange ? 'Quantité rendue *' : 'Quantité annulée *'}
          </span>
          <input
            className="cf-input"
            type="number"
            min={1}
            max={restant}
            value={qtyStr}
            onChange={(e) => setQtyStr(e.target.value)}
            disabled={loading}
          />
          {!qtyOk ? (
            <small className="cf-error">Entre 1 et {restant}.</small>
          ) : null}
        </label>
      ) : null}

      {exchange ? (
        <>
          <label className="cf-field">
            <span className="cf-field__label">Article pris en échange *</span>
            <select
              className="cf-input"
              value={newVariantId}
              onChange={(e) => setNewVariantId(e.target.value)}
              disabled={loading}
            >
              <option value="">— Choisir un article —</option>
              {choices.map((c) => (
                <option key={c.variantId} value={c.variantId}>
                  {exchangeChoiceLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="cf-field">
            <span className="cf-field__label">Quantité prise</span>
            <input
              className="cf-input"
              type="number"
              min={1}
              value={newQtyStr}
              placeholder={qtyOk ? String(qty) : '1'}
              onChange={(e) => setNewQtyStr(e.target.value)}
              disabled={loading}
            />
            <small className="cf-field__hint">
              Par défaut, autant d’articles que rendus.
            </small>
          </label>
        </>
      ) : null}

      {delivered ? (
        <>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}
          >
            <input
              type="checkbox"
              checked={goodsReturned}
              onChange={(e) => setGoodsReturned(e.target.checked)}
              disabled={loading}
            />
            <span>L’adhérent a rapporté l’article</span>
          </label>
          <p className="cf-field__hint">
            Commande déjà remise : le club ne reprend que ce qu’il a récupéré.
          </p>
        </>
      ) : null}

      {exited ? (
        <label className="cf-field">
          <span className="cf-field__label">Article rendu</span>
          <select
            className="cf-input"
            value={goodsLost ? 'LOST' : 'RESELL'}
            onChange={(e) => setGoodsLost(e.target.value === 'LOST')}
            disabled={loading}
          >
            <option value="RESELL">Remis en vente</option>
            <option value="LOST">Perdu, cassé ou volé</option>
          </select>
        </label>
      ) : null}

      {!ready ? (
        <p className="cf-muted">
          {exchange && newVariantId === ''
            ? 'Choisis l’article pris en échange : l’aperçu dira ce qui sera rendu ou facturé.'
            : 'Indique une quantité valide.'}
        </p>
      ) : null}
      {ready && previewLoading && !preview ? (
        <p className="cf-muted">Calcul…</p>
      ) : null}
      {previewError ? <p className="cf-error">{previewError.message}</p> : null}

      {preview ? (
        <>
          {preview.blockers.length > 0 ? (
            <div className="cf-alert cf-alert--danger">
              <div className="cf-alert__content">
                {preview.blockers.map((b) => (
                  <span key={b}>{b}</span>
                ))}
              </div>
            </div>
          ) : null}

          <h3 style={{ margin: '16px 0 4px', fontSize: 14 }}>Argent</h3>
          <p className="cf-muted" style={{ margin: '0 0 4px' }}>
            Retiré : {fmtEuros(preview.removedCents)}
            {exchange ? ` · pris : ${fmtEuros(preview.addedCents)}` : ''}
          </p>
          <ul className="cf-order-lines">
            {adjustmentMoneyLines(preview).map((l) => (
              <li key={l}>
                <span>{l}</span>
              </li>
            ))}
          </ul>

          <h3 style={{ margin: '16px 0 4px', fontSize: 14 }}>Articles</h3>
          <ul className="cf-order-lines">
            {adjustmentGoodsLines(preview, line.label).map((l) => (
              <li key={l}>
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/*
        La signature reste montée pendant que l'aperçu se recalcule : elle ne
        dépend que de la commande, jamais de la réponse du serveur.
      */}
      {signatureNeeded ? (
        <>
          <h3 style={{ margin: '16px 0 4px', fontSize: 14 }}>
            Signature de l’échange
          </h3>
          <label className="cf-field">
            <span className="cf-field__label">Nom de la personne qui signe *</span>
            <input
              className="cf-input"
              value={signerName}
              maxLength={160}
              onChange={(e) => setSignerName(e.target.value)}
              disabled={loading}
            />
          </label>
          <p className="cf-field__hint">
            En signant, {signerName.trim() || 'la personne'} reconnaît avoir
            rendu « {line.label} » et reçu «{' '}
            {preview?.newItemLabel ?? 'l’article choisi'} ».
          </p>
          <SignatureField onChange={setSignature} disabled={loading} />
        </>
      ) : null}

      <label className="cf-field">
        <span className="cf-field__label">Motif *</span>
        <textarea
          className="cf-input"
          rows={2}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            exchange
              ? 'Ex. : taille trop petite'
              : 'Ex. : article en rupture chez le fournisseur'
          }
          disabled={loading}
        />
        <small className="cf-field__hint">
          Repris sur les avoirs{exchange ? ' et le bon d’échange' : ''}.
        </small>
      </label>

      {formError && preview && preview.blockers.length === 0 ? (
        <p className="cf-muted">{formError}</p>
      ) : null}
      {erreur ? <p className="cf-error">{erreur}</p> : null}
    </Drawer>
  );
}

/**
 * Envoi du bon d'échange par e-mail : à l'adresse de l'acheteur, ou à celle
 * d'un parent.
 */
export function ShopExchangeNoteMailDrawer({
  adjustmentId,
  defaultEmail,
  onClose,
}: {
  adjustmentId: string;
  defaultEmail: string | null;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [erreur, setErreur] = useState<string | null>(null);
  const [send, { loading }] =
    useMutation<SendShopExchangeNoteMutationData>(SEND_SHOP_EXCHANGE_NOTE);
  const adresse = email.trim();

  async function onSubmit() {
    setErreur(null);
    try {
      const { data } = await send({
        variables: { input: { adjustmentId, email: adresse } },
      });
      showToast(
        `Bon d’échange envoyé à ${data?.sendShopExchangeNote ?? adresse}.`,
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
      title="Envoyer le bon d’échange"
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
        Le bon d’échange signé part en pièce jointe (PDF).
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
