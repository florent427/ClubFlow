import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import { Drawer } from '../../components/ui';
import {
  CANCEL_AND_REFUND_SHOP_ORDER,
  SHOP_ORDER_CANCELLATION_PREVIEW,
} from '../../lib/documents';
import {
  cancelFormError,
  cancellationToast,
  lineGoodsLabel,
  planMoneyLines,
} from '../../lib/shop-order-cancellation';
import type {
  CancelAndRefundShopOrderMutationData,
  ShopOrder,
  ShopOrderCancellationPreviewQueryData,
} from '../../lib/types';
import { fmtEuros } from './shop-format';

/**
 * Annulation d'une commande par le club (ADR-0019), payée ou non, remise ou
 * non. Avant de confirmer, l'admin voit ce qui sera rendu et par quel moyen,
 * le reste dû éteint, et ce que devient chaque article : un article rendu est
 * remis en vente ou déclaré perdu. Le serveur exécute le plan affiché.
 */
export function ShopOrderCancelDrawer({
  order,
  onClose,
  onCancelled,
}: {
  order: ShopOrder;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const { showToast } = useToast();
  const [reason, setReason] = useState('');
  const [goodsReturned, setGoodsReturned] = useState(false);
  const [lost, setLost] = useState<ReadonlySet<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);
  const {
    data,
    loading: previewLoading,
    error: previewError,
  } = useQuery<ShopOrderCancellationPreviewQueryData>(
    SHOP_ORDER_CANCELLATION_PREVIEW,
    { variables: { orderId: order.id }, fetchPolicy: 'network-only' },
  );
  const [cancel, { loading }] = useMutation<CancelAndRefundShopOrderMutationData>(
    CANCEL_AND_REFUND_SHOP_ORDER,
  );

  const preview = data?.shopOrderCancellationPreview ?? null;
  const formError = preview
    ? cancelFormError(preview, { reason, goodsReturned })
    : null;
  const canSubmit = preview !== null && !loading && formError === null;
  const buyer =
    `${order.buyerFirstName ?? ''} ${order.buyerLastName ?? ''}`.trim();

  function setLineLost(lineId: string, isLost: boolean) {
    setLost((prev) => {
      const next = new Set(prev);
      if (isLost) next.add(lineId);
      else next.delete(lineId);
      return next;
    });
  }

  async function onSubmit() {
    if (!canSubmit) return;
    setErreur(null);
    try {
      const { data: res } = await cancel({
        variables: {
          input: {
            orderId: order.id,
            reason: reason.trim(),
            goodsReturned,
            lostLineIds: [...lost],
          },
        },
      });
      if (res) {
        const toast = cancellationToast(res.cancelAndRefundShopOrder);
        showToast(toast.message, toast.tone);
      }
      onCancelled();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Annulation impossible.');
    }
  }

  return (
    <Drawer
      open
      title="Annuler la commande"
      onClose={onClose}
      footer={
        <div className="cf-form-actions">
          <button
            type="button"
            className="cf-btn"
            onClick={onClose}
            disabled={loading}
          >
            Retour
          </button>
          <button
            type="button"
            className="cf-btn cf-btn--danger"
            onClick={() => void onSubmit()}
            disabled={!canSubmit}
          >
            {loading ? 'Annulation…' : 'Confirmer l’annulation'}
          </button>
        </div>
      }
    >
      <p style={{ marginTop: 0 }}>
        <strong>{buyer || '—'}</strong> · {fmtEuros(order.totalCents)}
      </p>

      {previewLoading && !preview ? (
        <p className="cf-muted">Calcul de l’annulation…</p>
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

          <h3 style={{ margin: '16px 0 4px', fontSize: 14 }}>Règlements</h3>
          <ul className="cf-order-lines">
            {planMoneyLines(preview).map((l) => (
              <li key={l}>
                <span>{l}</span>
              </li>
            ))}
          </ul>

          <h3 style={{ margin: '16px 0 4px', fontSize: 14 }}>Articles</h3>
          <ul className="cf-order-lines">
            {preview.lines.map((line) => (
              <li key={line.lineId}>
                <span>
                  {line.label}
                  <br />
                  <small className="cf-muted">{lineGoodsLabel(line)}</small>
                </span>
                {line.returnUnits > 0 ? (
                  <select
                    className="cf-input"
                    style={{ maxWidth: 200 }}
                    aria-label={`Devenir de ${line.label}`}
                    value={lost.has(line.lineId) ? 'LOST' : 'RESELL'}
                    onChange={(e) =>
                      setLineLost(line.lineId, e.target.value === 'LOST')
                    }
                    disabled={loading}
                  >
                    <option value="RESELL">Remis en vente</option>
                    <option value="LOST">Perdu, cassé ou volé</option>
                  </select>
                ) : null}
              </li>
            ))}
          </ul>

          {preview.delivered ? (
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
                <span>L’adhérent a rapporté les articles</span>
              </label>
              <p className="cf-field__hint">
                Commande déjà remise : le club ne reprend que ce qu’il a
                récupéré.
              </p>
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
              placeholder="Ex. : taille indisponible, erreur de commande…"
              disabled={loading}
            />
            <small className="cf-field__hint">Repris sur les avoirs.</small>
          </label>
        </>
      ) : null}

      {erreur ? <p className="cf-error">{erreur}</p> : null}
    </Drawer>
  );
}
