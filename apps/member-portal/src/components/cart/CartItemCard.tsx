import { useMutation } from '@apollo/client/react';
import {
  VIEWER_ACTIVE_CART,
  VIEWER_REMOVE_CART_ITEM,
  VIEWER_UPDATE_CART_ITEM,
  type CartItem,
} from '../../lib/cart-documents';
import { formatEuroCents } from '../../lib/format';
import { useToast } from '../ToastProvider';

type BillingRhythm = 'ANNUAL' | 'MONTHLY';

interface Props {
  item: CartItem;
  disabled?: boolean;
}

export function CartItemCard({ item, disabled }: Props) {
  const { showToast } = useToast();

  const [updateItem, { loading: updating }] = useMutation(
    VIEWER_UPDATE_CART_ITEM,
    { refetchQueries: [{ query: VIEWER_ACTIVE_CART }] },
  );
  const [removeItem, { loading: removing }] = useMutation(
    VIEWER_REMOVE_CART_ITEM,
    { refetchQueries: [{ query: VIEWER_ACTIVE_CART }] },
  );

  const busy = updating || removing || disabled === true;
  const manualAssign = item.requiresManualAssignment;

  async function handleRhythmChange(rhythm: BillingRhythm): Promise<void> {
    try {
      await updateItem({
        variables: {
          input: { itemId: item.id, billingRhythm: rhythm },
        },
      });
      showToast('Rythme mis à jour.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Impossible de modifier le rythme.',
        'error',
      );
    }
  }

  async function handleRemove(): Promise<void> {
    if (!window.confirm(`Retirer ${item.memberFullName} du projet ?`)) return;
    try {
      await removeItem({ variables: { itemId: item.id } });
      showToast('Membre retiré du projet.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Impossible de retirer le membre.',
        'error',
      );
    }
  }

  return (
    <article
      className={`mp-cart-item ${
        manualAssign ? 'mp-cart-item--alert' : ''
      }`.trim()}
    >
      <header className="mp-cart-item__head">
        <div>
          <h3 className="mp-cart-item__name">{item.memberFullName}</h3>
          {manualAssign ? (
            <span className="mp-cart-item__badge mp-cart-item__badge--warn">
              À compléter — aucune formule par âge
            </span>
          ) : (
            <span className="mp-cart-item__badge mp-cart-item__badge--ok">
              {item.membershipProductLabel ?? 'Formule assignée'}
            </span>
          )}
        </div>
        <button
          type="button"
          className="mp-icon-btn"
          disabled={busy}
          onClick={() => void handleRemove()}
          aria-label="Retirer du projet"
          title="Retirer du projet"
        >
          <span className="material-symbols-outlined">delete</span>
        </button>
      </header>

      {!manualAssign ? (
        <>
          <fieldset className="mp-fieldset">
            <legend className="mp-legend">Rythme de règlement</legend>
            <label className="mp-radio mp-radio--inline">
              <input
                type="radio"
                name={`rhythm-${item.id}`}
                value="ANNUAL"
                checked={item.billingRhythm === 'ANNUAL'}
                disabled={busy}
                onChange={() => void handleRhythmChange('ANNUAL')}
              />
              <span>Annuel</span>
            </label>
            <label className="mp-radio mp-radio--inline">
              <input
                type="radio"
                name={`rhythm-${item.id}`}
                value="MONTHLY"
                checked={item.billingRhythm === 'MONTHLY'}
                disabled={busy}
                onChange={() => void handleRhythmChange('MONTHLY')}
              />
              <span>Mensuel</span>
            </label>
          </fieldset>

          {/* Le toggle « licence existante » vit dans CartFeesSection
              (row LICENSE avec validation du numéro) — plus de doublon
              ici pour éviter deux contrôles contradictoires. */}

          <dl className="mp-cart-item__lines">
            <div>
              <dt>Cotisation</dt>
              <dd>{formatEuroCents(item.subscriptionAdjustedCents)}</dd>
            </div>
            {item.oneTimeFeesCents > 0 ? (
              <div>
                <dt>Frais uniques</dt>
                <dd>{formatEuroCents(item.oneTimeFeesCents)}</dd>
              </div>
            ) : null}
            {item.exceptionalDiscountCents > 0 ? (
              <div>
                <dt>Remise exceptionnelle</dt>
                <dd>-{formatEuroCents(item.exceptionalDiscountCents)}</dd>
              </div>
            ) : null}
            {item.pricingRulePreviews?.map((p, idx) => (
              <div
                key={`${p.ruleLabel}-${idx}`}
                style={{ color: '#15803d' }}
                title={p.reason}
              >
                <dt>
                  🎁 {p.ruleLabel}
                  <br />
                  <small
                    style={{
                      fontWeight: 400,
                      color: '#15803d',
                      opacity: 0.85,
                    }}
                  >
                    {p.reason}
                  </small>
                </dt>
                <dd>{formatEuroCents(p.deltaAmountCents)}</dd>
              </div>
            ))}
            <div className="mp-cart-item__total">
              <dt>Total ligne</dt>
              <dd>{formatEuroCents(item.lineTotalCents)}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="mp-hint">
          Aucune formule automatique ne correspond à l&rsquo;âge. Contactez le
          club qui vous attribuera la formule adaptée ou appliquera une remise
          exceptionnelle.
        </p>
      )}
    </article>
  );
}
