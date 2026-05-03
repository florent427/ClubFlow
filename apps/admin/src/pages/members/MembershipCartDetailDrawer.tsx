import { useMutation } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import {
  CLUB_APPLY_EXCEPTIONAL_DISCOUNT,
  CLUB_CANCEL_CART,
  CLUB_MEMBERSHIP_CARTS,
  CLUB_REMOVE_CART_ITEM,
  CLUB_TOGGLE_CART_LICENSE,
  CLUB_UPDATE_CART_ITEM,
  CLUB_VALIDATE_CART,
  type AdminCart,
  type AdminCartItem,
  type BillingRhythm,
} from '../../lib/cart-documents';
import { useToast } from '../../components/ToastProvider';

interface Props {
  cart: AdminCart;
  onClose: () => void;
}

function formatEuros(cents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

export function MembershipCartDetailDrawer({ cart, onClose }: Props) {
  const { showToast } = useToast();
  const refetchQueries = [{ query: CLUB_MEMBERSHIP_CARTS }];

  const [updateItem, { loading: updating }] = useMutation(
    CLUB_UPDATE_CART_ITEM,
    { refetchQueries },
  );
  const [toggleLicense, { loading: togglingLicense }] = useMutation(
    CLUB_TOGGLE_CART_LICENSE,
    { refetchQueries },
  );
  const [removeItem, { loading: removing }] = useMutation(
    CLUB_REMOVE_CART_ITEM,
    { refetchQueries },
  );
  const [applyDiscount, { loading: applyingDiscount }] = useMutation(
    CLUB_APPLY_EXCEPTIONAL_DISCOUNT,
    { refetchQueries },
  );
  const [validateCart, { loading: validating }] = useMutation(
    CLUB_VALIDATE_CART,
    { refetchQueries },
  );
  const [cancelCart, { loading: cancelling }] = useMutation(CLUB_CANCEL_CART, {
    refetchQueries,
  });

  const busy =
    updating ||
    togglingLicense ||
    removing ||
    applyingDiscount ||
    validating ||
    cancelling;

  async function handleRhythm(
    item: AdminCartItem,
    rhythm: BillingRhythm,
  ): Promise<void> {
    try {
      await updateItem({
        variables: { input: { itemId: item.id, billingRhythm: rhythm } },
      });
      showToast('Rythme mis à jour.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec.',
        'error',
      );
    }
  }

  async function handleRemove(item: AdminCartItem): Promise<void> {
    if (!window.confirm(`Retirer ${item.memberFullName} du projet ?`)) return;
    try {
      await removeItem({ variables: { itemId: item.id } });
      showToast('Membre retiré.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec.', 'error');
    }
  }

  async function handleValidate(): Promise<void> {
    if (
      !window.confirm(
        `Valider le projet pour ${cart.payerFullName ?? 'ce foyer'} ? Une facture va être émise et le payeur recevra un email.`,
      )
    ) {
      return;
    }
    try {
      await validateCart({
        variables: { input: { cartId: cart.id } },
      });
      showToast('Projet validé — facture émise.', 'success');
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec.', 'error');
    }
  }

  async function handleCancel(): Promise<void> {
    const reason = window.prompt(
      'Raison de l\u2019annulation (visible par l\u2019admin) :',
      '',
    );
    if (reason === null) return;
    if (reason.trim().length < 1) {
      showToast('Raison obligatoire.', 'error');
      return;
    }
    try {
      await cancelCart({
        variables: { input: { cartId: cart.id, reason: reason.trim() } },
      });
      showToast('Projet annulé.', 'success');
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec.', 'error');
    }
  }

  const isOpen = cart.status === 'OPEN';

  return (
    <div
      className="family-drawer-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <aside
        className="family-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
      >
        <header className="family-drawer__head">
          <div>
            <p className="members-loom__eyebrow" id="cart-drawer-title">
              Projet d&rsquo;adhésion · {cart.clubSeasonLabel}
            </p>
            <h2 className="family-drawer__title">
              {cart.payerFullName ?? 'Payeur à définir'}
            </h2>
            <p className="muted">
              Statut : <strong>{cart.status}</strong> · Total{' '}
              {formatEuros(cart.totalCents)}
              {cart.requiresManualAssignmentCount > 0 ? (
                <>
                  {' '}
                  ·{' '}
                  <span className="families-needs-payer-badge">
                    {cart.requiresManualAssignmentCount} alerte(s)
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-tight"
            onClick={onClose}
          >
            Fermer
          </button>
        </header>

        <div className="family-drawer__section">
          <h3 className="family-drawer__h">Lignes</h3>
          {cart.items.length === 0 ? (
            <p className="muted">Aucune ligne dans ce projet.</p>
          ) : (
            <ul className="family-drawer__members">
              {cart.items.map((item) => (
                <AdminCartItemRow
                  key={item.id}
                  item={item}
                  editable={isOpen && !busy}
                  onRemove={() => void handleRemove(item)}
                  onRhythmChange={(r) => void handleRhythm(item, r)}
                  onToggleLicense={async (has, num) => {
                    try {
                      await toggleLicense({
                        variables: {
                          input: {
                            itemId: item.id,
                            hasExistingLicense: has,
                            existingLicenseNumber: num,
                          },
                        },
                      });
                      showToast('Licence mise à jour.', 'success');
                    } catch (err) {
                      showToast(
                        err instanceof Error ? err.message : 'Échec.',
                        'error',
                      );
                    }
                  }}
                  onApplyDiscount={async (amountCents, reason) => {
                    try {
                      await applyDiscount({
                        variables: {
                          input: { itemId: item.id, amountCents, reason },
                        },
                      });
                      showToast('Remise appliquée.', 'success');
                    } catch (err) {
                      showToast(
                        err instanceof Error ? err.message : 'Échec.',
                        'error',
                      );
                    }
                  }}
                />
              ))}
            </ul>
          )}
        </div>

        {isOpen ? (
          <div className="family-drawer__section">
            <h3 className="family-drawer__h">Actions</h3>
            <div className="family-drawer__hg-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!cart.canValidate || busy}
                onClick={() => void handleValidate()}
              >
                {validating ? 'Validation…' : 'Valider au nom du foyer'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => void handleCancel()}
              >
                Annuler le projet
              </button>
            </div>
            {!cart.canValidate ? (
              <p className="muted">
                Validation bloquée : au moins une ligne nécessite une
                assignation manuelle (produit ou remise exceptionnelle).
              </p>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

// ----------------- sous-composant ligne -----------------

interface RowProps {
  item: AdminCartItem;
  editable: boolean;
  onRemove: () => void;
  onRhythmChange: (r: BillingRhythm) => void;
  onToggleLicense: (has: boolean, num: string | null) => Promise<void>;
  onApplyDiscount: (amountCents: number, reason: string) => Promise<void>;
}

function AdminCartItemRow({
  item,
  editable,
  onRemove,
  onRhythmChange,
  onToggleLicense,
  onApplyDiscount,
}: RowProps) {
  const [licenseNum, setLicenseNum] = useState<string>(
    item.existingLicenseNumber ?? '',
  );
  const [discountAmount, setDiscountAmount] = useState<string>(
    item.exceptionalDiscountCents > 0
      ? (item.exceptionalDiscountCents / 100).toString()
      : '',
  );
  const [discountReason, setDiscountReason] = useState<string>(
    item.exceptionalDiscountReason ?? '',
  );

  useEffect(() => {
    setLicenseNum(item.existingLicenseNumber ?? '');
    setDiscountAmount(
      item.exceptionalDiscountCents > 0
        ? (item.exceptionalDiscountCents / 100).toString()
        : '',
    );
    setDiscountReason(item.exceptionalDiscountReason ?? '');
  }, [item.id, item.existingLicenseNumber, item.exceptionalDiscountCents, item.exceptionalDiscountReason]);

  return (
    <li className="family-drawer__member-row">
      <div>
        <strong>{item.memberFullName}</strong>
        <br />
        <span className="muted">
          {item.requiresManualAssignment
            ? '⚠ Aucune formule par âge'
            : (item.membershipProductLabel ?? 'Formule')}
          {' · '}
          {item.billingRhythm === 'ANNUAL' ? 'Annuel' : 'Mensuel'} ·{' '}
          {formatEuros(item.lineTotalCents)}
        </span>
        {item.hasExistingLicense ? (
          <>
            <br />
            <span className="muted">
              Licence déjà détenue : {item.existingLicenseNumber ?? '—'}
            </span>
          </>
        ) : null}
        {item.exceptionalDiscountCents > 0 ? (
          <>
            <br />
            <span className="muted">
              Remise exceptionnelle : -{formatEuros(item.exceptionalDiscountCents)}
              {item.exceptionalDiscountReason
                ? ` (${item.exceptionalDiscountReason})`
                : ''}
            </span>
          </>
        ) : null}
      </div>

      {editable ? (
        <div className="family-drawer__member-actions">
          <select
            value={item.billingRhythm}
            onChange={(e) => onRhythmChange(e.target.value as BillingRhythm)}
          >
            <option value="ANNUAL">Annuel</option>
            <option value="MONTHLY">Mensuel</option>
          </select>

          <details>
            <summary>Licence existante</summary>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input
                type="text"
                placeholder="N° licence"
                value={licenseNum}
                onChange={(e) => setLicenseNum(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-tight"
                onClick={() => {
                  if (licenseNum.trim().length < 3) return;
                  void onToggleLicense(true, licenseNum.trim());
                }}
              >
                Enregistrer
              </button>
              {item.hasExistingLicense ? (
                <button
                  type="button"
                  className="btn btn-tight btn-ghost"
                  onClick={() => void onToggleLicense(false, null)}
                >
                  Retirer
                </button>
              ) : null}
            </div>
          </details>

          <details>
            <summary>Remise exceptionnelle</summary>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <input
                type="number"
                min={0}
                placeholder="€"
                style={{ width: 90 }}
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
              />
              <input
                type="text"
                placeholder="Motif"
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-tight"
                onClick={() => {
                  const euros = Number(discountAmount);
                  if (!Number.isFinite(euros) || euros < 0) return;
                  if (discountReason.trim().length < 3) return;
                  void onApplyDiscount(
                    Math.round(euros * 100),
                    discountReason.trim(),
                  );
                }}
              >
                Appliquer
              </button>
            </div>
          </details>

          <button
            type="button"
            className="btn btn-tight btn-ghost"
            onClick={onRemove}
          >
            Retirer
          </button>
        </div>
      ) : null}
    </li>
  );
}
