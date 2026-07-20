import { useMutation } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  RECEIVE_SHOP_PURCHASE_ORDER,
  SHOP_LOW_STOCK_VARIANTS,
  SHOP_PRODUCTS,
  SHOP_PURCHASE_ORDERS,
} from '../../lib/documents';
import type {
  ReceiveShopPurchaseOrderMutationData,
  ShopPurchaseOrder,
  ShopReceiptDiscrepancyReasonGql,
} from '../../lib/types';
import { useToast } from '../../components/ToastProvider';
import { Drawer } from '../../components/ui';
import {
  DISCREPANCY_REASONS,
  previewReceiptLine,
} from './shop-format';

/**
 * Ce que l'utilisateur saisit pour UNE ligne de commande, pour CETTE
 * livraison-là. La réception est partielle par nature (ADR-0013 §5) : rien
 * n'oblige à toucher toutes les lignes, et `include` porte ce choix.
 */
type LineDraft = {
  include: boolean;
  qtyStr: string;
  reason: ShopReceiptDiscrepancyReasonGql | null;
  note: string;
};

function emptyDraft(): LineDraft {
  return { include: false, qtyStr: '', reason: null, note: '' };
}

function parseQty(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

export function ReceptionDrawer({
  order,
  variantNames,
  onClose,
}: {
  order: ShopPurchaseOrder;
  variantNames: Map<string, string>;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [receive, { loading }] =
    useMutation<ReceiveShopPurchaseOrderMutationData>(
      RECEIVE_SHOP_PURCHASE_ORDER,
    );

  // Une ligne soldée n'accepte plus rien : le serveur la refuse, l'écran ne
  // doit donc pas proposer de la saisir.
  const openLines = useMemo(
    () => order.lines.filter((l) => !l.closed),
    [order.lines],
  );

  const [drafts, setDrafts] = useState<Record<string, LineDraft>>(() => {
    const seed: Record<string, LineDraft> = {};
    for (const l of order.lines) seed[l.id] = emptyDraft();
    return seed;
  });
  const [deliveryNote, setDeliveryNote] = useState('');
  const [notes, setNotes] = useState('');

  function patch(lineId: string, p: Partial<LineDraft>) {
    setDrafts((d) => ({ ...d, [lineId]: { ...(d[lineId] ?? emptyDraft()), ...p } }));
  }

  /** Ce que chaque ligne saisie va produire, calculé à la frappe. */
  const previews = useMemo(() => {
    const out = new Map<
      string,
      ReturnType<typeof previewReceiptLine> & { qty: number | null }
    >();
    for (const l of openLines) {
      const d = drafts[l.id] ?? emptyDraft();
      if (!d.include) continue;
      const qty = parseQty(d.qtyStr);
      out.set(l.id, {
        ...previewReceiptLine({
          orderedQty: l.orderedQty,
          alreadyReceived: l.receivedQty,
          receivedQty: qty ?? 0,
          reason: d.reason,
          note: d.note,
        }),
        qty,
      });
    }
    return out;
  }, [openLines, drafts]);

  const included = openLines.filter((l) => drafts[l.id]?.include);
  const willCloseCount = included.filter(
    (l) => previews.get(l.id)?.willClose,
  ).length;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (included.length === 0) {
      showToast('Cochez au moins une ligne reçue.', 'error');
      return;
    }
    for (const l of included) {
      const p = previews.get(l.id);
      const name = variantNames.get(l.variantId) ?? 'cet article';
      if (!p || p.qty === null) {
        showToast(`Quantité reçue invalide sur « ${name} »`, 'error');
        return;
      }
      if (p.blocker) {
        showToast(`${name} : ${p.blocker}`, 'error');
        return;
      }
    }

    try {
      await receive({
        variables: {
          input: {
            orderId: order.id,
            deliveryNote: deliveryNote.trim() || null,
            notes: notes.trim() || null,
            lines: included.map((l) => {
              const d = drafts[l.id]!;
              return {
                orderLineId: l.id,
                receivedQty: parseQty(d.qtyStr) ?? 0,
                discrepancyReason: d.reason,
                discrepancyNote: d.note.trim() || null,
              };
            }),
          },
        },
        // Une réception écrit du stock ET recalcule le statut de la commande.
        // Le catalogue (`onOrder`, `avgCostCents`, valeur du stock) et la
        // liste « à réapprovisionner » sont périmés dès cet instant : les
        // laisser en cache afficherait des chiffres faux.
        refetchQueries: [
          { query: SHOP_PURCHASE_ORDERS },
          { query: SHOP_PRODUCTS },
          { query: SHOP_LOW_STOCK_VARIANTS },
        ],
        awaitRefetchQueries: true,
      });
      showToast('Réception enregistrée', 'success');
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  return (
    <Drawer
      open
      width={880}
      title={`Réception — commande ${order.reference}`}
      onClose={onClose}
    >
      <form onSubmit={(e) => void onSubmit(e)} className="cf-form">
        <p className="cf-muted">
          Une commande arrive rarement en une fois. Saisissez ce que
          <strong> cette livraison-là </strong>
          contient, ligne à ligne : les lignes non cochées restent en l’état et
          pourront être reçues plus tard.
        </p>

        {openLines.length === 0 ? (
          <p className="cf-muted">
            Toutes les lignes de cette commande sont soldées : plus rien n’est
            attendu.
          </p>
        ) : null}

        {openLines.map((line) => {
          const d = drafts[line.id] ?? emptyDraft();
          const p = previews.get(line.id);
          const name = variantNames.get(line.variantId) ?? line.variantId;
          const remainingBefore = Math.max(
            0,
            line.orderedQty - line.receivedQty,
          );
          return (
            <section key={line.id} className="cf-variant-section">
              <label className="cf-checkbox">
                <input
                  type="checkbox"
                  checked={d.include}
                  onChange={(e) => {
                    patch(line.id, {
                      include: e.target.checked,
                      // Pré-rempli au reliquat : le cas courant est « tout est
                      // arrivé », et il ne doit demander aucune saisie.
                      qtyStr: e.target.checked
                        ? String(remainingBefore)
                        : '',
                      reason: null,
                      note: '',
                    });
                  }}
                />
                <span>
                  <strong>{name}</strong> — {line.orderedQty} commandé
                  {line.orderedQty > 1 ? 's' : ''}, {line.receivedQty} déjà
                  reçu{line.receivedQty > 1 ? 's' : ''}, reste{' '}
                  {remainingBefore}
                </span>
              </label>

              {d.include ? (
                <div className="cf-form">
                  <label className="cf-field">
                    <span className="cf-field__label">
                      Reçu dans cette livraison
                    </span>
                    <input
                      type="number"
                      className="cf-input"
                      min={0}
                      value={d.qtyStr}
                      onChange={(e) =>
                        patch(line.id, { qtyStr: e.target.value })
                      }
                    />
                    <span className="cf-field__hint">
                      Zéro est licite : « rien n’est arrivé », avec son motif.
                    </span>
                  </label>

                  {p?.hasDiscrepancy ? (
                    <fieldset className="cf-field">
                      <legend className="cf-field__label">
                        Écart : {p.cumulative} reçu au total sur{' '}
                        {line.orderedQty} commandés — motif obligatoire
                      </legend>
                      {/*
                        LE POINT QUI COMPTE (ADR-0013 §2).

                        Le motif n'est pas une étiquette : il décide si la
                        ligne reste ouverte ou se solde DÉFINITIVEMENT. Un
                        menu déroulant nu ferait solder par erreur des lignes
                        qu'on attend encore — la conséquence est donc écrite
                        en clair sous CHAQUE choix, et pas seulement une fois
                        après coup.
                      */}
                      <ul className="cf-survey-options-editor">
                        {DISCREPANCY_REASONS.map((r) => (
                          <li key={r.value}>
                            <label className="cf-checkbox">
                              <input
                                type="radio"
                                name={`reason-${line.id}`}
                                checked={d.reason === r.value}
                                onChange={() =>
                                  patch(line.id, { reason: r.value })
                                }
                              />
                              <span>
                                <strong>{r.label}</strong>
                                <span
                                  className={`cf-pill cf-pill--${
                                    r.keepsOpen ? 'warn' : 'muted'
                                  }`}
                                >
                                  {r.keepsOpen
                                    ? 'ligne laissée OUVERTE'
                                    : 'ligne SOLDÉE'}
                                </span>
                                <span className="cf-field__hint">
                                  {r.consequence}
                                </span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>

                      {d.reason === 'OTHER' ? (
                        <label className="cf-field">
                          <span className="cf-field__label">
                            Commentaire (obligatoire pour « Autre motif »)
                          </span>
                          <input
                            type="text"
                            className="cf-input"
                            value={d.note}
                            maxLength={300}
                            onChange={(e) =>
                              patch(line.id, { note: e.target.value })
                            }
                          />
                        </label>
                      ) : null}
                    </fieldset>
                  ) : null}

                  {/*
                    La conséquence RÉCAPITULÉE, sur la ligne, avant validation.
                    Elle est affichée même sans écart — « soldée parce que la
                    quantité est atteinte » n'est pas la même chose que
                    « soldée courte », et le trésorier doit voir laquelle.
                  */}
                  {p ? (
                    <p
                      className={`cf-pill cf-pill--${
                        p.blocker ? 'danger' : p.willClose ? 'muted' : 'warn'
                      }`}
                    >
                      {p.blocker
                        ? p.blocker
                        : p.willClose
                          ? p.hasDiscrepancy
                            ? `Après validation : ligne SOLDÉE COURTE — les ${Math.max(
                                0,
                                line.orderedQty - p.cumulative,
                              )} manquants ne seront plus attendus.`
                            : 'Après validation : ligne SOLDÉE — la quantité commandée est atteinte.'
                          : `Après validation : ligne encore OUVERTE — ${p.remaining} unité(s) restent attendues du fournisseur.`}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        })}

        <label className="cf-field">
          <span className="cf-field__label">Bon de livraison</span>
          <input
            type="text"
            className="cf-input"
            value={deliveryNote}
            maxLength={80}
            onChange={(e) => setDeliveryNote(e.target.value)}
            placeholder="BL-2026-0912"
          />
        </label>
        <label className="cf-field">
          <span className="cf-field__label">Notes sur cette livraison</span>
          <textarea
            className="cf-input"
            rows={2}
            value={notes}
            maxLength={500}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        {included.length > 0 ? (
          <p className="cf-field__hint">
            {included.length} ligne(s) saisie(s), dont {willCloseCount} qui
            seront soldées et ne pourront plus rien recevoir. Cette réception
            ne produit <strong>aucune écriture comptable</strong> : la facture
            fournisseur se saisit en comptabilité, puis se rapproche de cette
            commande.
          </p>
        ) : null}

        <div className="cf-form-actions">
          <button type="button" className="cf-btn" onClick={onClose}>
            Annuler
          </button>
          <button
            type="submit"
            className="cf-btn cf-btn--primary"
            disabled={loading || included.length === 0}
          >
            Enregistrer la réception
          </button>
        </div>
      </form>
    </Drawer>
  );
}
