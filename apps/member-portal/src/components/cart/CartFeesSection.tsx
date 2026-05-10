import { useState } from 'react';
import { useMutation } from '@apollo/client/react';
import {
  VIEWER_ACTIVE_CART,
  VIEWER_TOGGLE_CART_LICENSE,
  VIEWER_TOGGLE_PENDING_LICENSE,
  VIEWER_UPDATE_CART_ITEM,
  VIEWER_UPDATE_CART_PENDING_ITEM,
  type CartItem,
  type CartPendingItem,
  type ClubOneTimeFee,
} from '../../lib/cart-documents';
import { formatEuroCents } from '../../lib/format';
import { useToast } from '../ToastProvider';

type Props =
  | {
      kind: 'item';
      item: CartItem;
      clubOneTimeFees: ClubOneTimeFee[];
      busy?: boolean;
    }
  | {
      kind: 'pending';
      pending: CartPendingItem;
      clubOneTimeFees: ClubOneTimeFee[];
      busy?: boolean;
    };

/**
 * Section "Frais ponctuels" pour un cart item OU pending item — parité
 * fonctionnelle avec le mobile (`CartItemFeesSection`).
 *
 * - LICENSE : checkbox cochée par défaut. Décocher ouvre la modale
 *   numéro (validé contre `licenseNumberPattern` du club).
 * - MANDATORY : badge info-only "obligatoire" (non décochable).
 * - OPTIONAL : checkbox toggleable (synchro override CSV).
 */
export function CartFeesSection(props: Props) {
  const { showToast } = useToast();
  const isPending = props.kind === 'pending';
  const targetId = isPending ? props.pending.id : props.item.id;
  const fees = props.clubOneTimeFees;
  const busy = props.busy === true;

  const hasExistingLicense = isPending
    ? props.pending.hasExistingLicense
    : props.item.hasExistingLicense;
  const existingLicenseNumber = isPending
    ? props.pending.existingLicenseNumber
    : props.item.existingLicenseNumber;
  const overrideIds = isPending
    ? props.pending.oneTimeFeeOverrideIds
    : props.item.oneTimeFeeOverrideIds;

  const [licenseModalOpen, setLicenseModalOpen] = useState(false);

  const [toggleItemLicense, { loading: togglingItemLic }] = useMutation(
    VIEWER_TOGGLE_CART_LICENSE,
    { refetchQueries: [{ query: VIEWER_ACTIVE_CART }] },
  );
  const [togglePendingLicense, { loading: togglingPendingLic }] = useMutation(
    VIEWER_TOGGLE_PENDING_LICENSE,
    { refetchQueries: [{ query: VIEWER_ACTIVE_CART }] },
  );
  const [updateItem, { loading: updatingItem }] = useMutation(
    VIEWER_UPDATE_CART_ITEM,
    { refetchQueries: [{ query: VIEWER_ACTIVE_CART }] },
  );
  const [updatePending, { loading: updatingPending }] = useMutation(
    VIEWER_UPDATE_CART_PENDING_ITEM,
    { refetchQueries: [{ query: VIEWER_ACTIVE_CART }] },
  );
  const togglingLicense = togglingItemLic || togglingPendingLic;
  const updatingFees = updatingItem || updatingPending;
  const allBusy = busy || togglingLicense || updatingFees;

  const licenseFee = fees.find((f) => f.kind === 'LICENSE');
  const mandatoryFees = fees.filter((f) => f.kind === 'MANDATORY');
  const optionalFees = fees.filter((f) => f.kind === 'OPTIONAL');

  function isOptionalSelected(feeId: string): boolean {
    if (overrideIds === null) {
      return fees.find((f) => f.id === feeId)?.autoApply ?? false;
    }
    return overrideIds.includes(feeId);
  }

  async function handleToggleOptional(fee: ClubOneTimeFee) {
    const currentEffective = fees
      .filter((f) => f.kind === 'OPTIONAL' && isOptionalSelected(f.id))
      .map((f) => f.id);
    const next = currentEffective.includes(fee.id)
      ? currentEffective.filter((id) => id !== fee.id)
      : [...currentEffective, fee.id];
    try {
      if (isPending) {
        await updatePending({
          variables: {
            input: {
              pendingItemId: targetId,
              membershipProductIds: props.pending.membershipProductIds,
              billingRhythm: props.pending.billingRhythm,
              oneTimeFeeOverrideIds: next,
            },
          },
        });
      } else {
        await updateItem({
          variables: {
            input: { itemId: targetId, oneTimeFeeOverrideIds: next },
          },
        });
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec mise à jour des frais.',
        'error',
      );
    }
  }

  async function handleToggleLicenseOff() {
    try {
      if (isPending) {
        await togglePendingLicense({
          variables: {
            input: {
              pendingItemId: targetId,
              hasExistingLicense: false,
              existingLicenseNumber: null,
            },
          },
        });
      } else {
        await toggleItemLicense({
          variables: {
            input: {
              itemId: targetId,
              hasExistingLicense: false,
              existingLicenseNumber: null,
            },
          },
        });
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec.',
        'error',
      );
    }
  }

  return (
    <div className="cart-fees">
      <h4 className="cart-fees__title">Frais ponctuels</h4>

      {/* === LICENSE — checkbox cochée par défaut, décocher = modale === */}
      {licenseFee ? (
        <button
          type="button"
          className="cart-fees__row cart-fees__row--toggle"
          disabled={allBusy}
          onClick={() => {
            if (hasExistingLicense) {
              void handleToggleLicenseOff();
            } else {
              setLicenseModalOpen(true);
            }
          }}
        >
          <span
            className={`cart-fees__check ${
              !hasExistingLicense ? 'cart-fees__check--on' : ''
            }`}
            aria-hidden="true"
          >
            {!hasExistingLicense ? '☑' : '☐'}
          </span>
          <span className="cart-fees__label">
            <strong>{licenseFee.label}</strong>
            <small className={hasExistingLicense ? 'cart-fees__sub--ok' : ''}>
              {hasExistingLicense
                ? `✓ Licence existante : ${existingLicenseNumber}`
                : 'Décochez si vous avez déjà votre licence pour la saison'}
            </small>
          </span>
          <span
            className={`cart-fees__amount ${
              hasExistingLicense ? 'cart-fees__amount--strike' : ''
            }`}
          >
            {formatEuroCents(licenseFee.amountCents)}
          </span>
        </button>
      ) : null}

      {/* === MANDATORY — info-only === */}
      {mandatoryFees.map((f) => (
        <div key={f.id} className="cart-fees__row cart-fees__row--mandatory">
          <span className="cart-fees__check" aria-hidden="true">
            🔒
          </span>
          <span className="cart-fees__label">
            <strong>{f.label}</strong>
            <small>Obligatoire (auto-ajouté)</small>
          </span>
          <span className="cart-fees__amount">
            {formatEuroCents(f.amountCents)}
          </span>
        </div>
      ))}

      {/* === OPTIONAL — checkbox toggleable === */}
      {optionalFees.map((f) => {
        const selected = isOptionalSelected(f.id);
        return (
          <button
            type="button"
            key={f.id}
            className="cart-fees__row cart-fees__row--toggle"
            disabled={allBusy}
            onClick={() => void handleToggleOptional(f)}
          >
            <span
              className={`cart-fees__check ${
                selected ? 'cart-fees__check--on' : ''
              }`}
              aria-hidden="true"
            >
              {selected ? '☑' : '☐'}
            </span>
            <span className="cart-fees__label">
              <strong>{f.label}</strong>
              <small>Optionnel</small>
            </span>
            <span
              className={`cart-fees__amount ${
                !selected ? 'cart-fees__amount--muted' : ''
              }`}
            >
              {formatEuroCents(f.amountCents)}
            </span>
          </button>
        );
      })}

      {licenseFee && licenseModalOpen ? (
        <LicenseModal
          fee={licenseFee}
          loading={togglingLicense}
          onClose={() => setLicenseModalOpen(false)}
          onSubmit={async (number) => {
            try {
              if (isPending) {
                await togglePendingLicense({
                  variables: {
                    input: {
                      pendingItemId: targetId,
                      hasExistingLicense: true,
                      existingLicenseNumber: number,
                    },
                  },
                });
              } else {
                await toggleItemLicense({
                  variables: {
                    input: {
                      itemId: targetId,
                      hasExistingLicense: true,
                      existingLicenseNumber: number,
                    },
                  },
                });
              }
              setLicenseModalOpen(false);
              return null;
            } catch (e: unknown) {
              return e instanceof Error ? e.message : 'Erreur inconnue.';
            }
          }}
        />
      ) : null}
    </div>
  );
}

function LicenseModal({
  fee,
  loading,
  onClose,
  onSubmit,
}: {
  fee: ClubOneTimeFee;
  loading: boolean;
  onClose: () => void;
  onSubmit: (licenseNumber: string) => Promise<string | null>;
}) {
  const [number, setNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  function validateClient(input: string): string | null {
    if (input.trim().length < 3) return 'Au moins 3 caractères.';
    if (fee.licenseNumberPattern) {
      try {
        const regex = new RegExp(fee.licenseNumberPattern);
        if (!regex.test(input.trim())) {
          return fee.licenseNumberFormatHint
            ? `Format attendu : ${fee.licenseNumberFormatHint}`
            : 'Format invalide.';
        }
      } catch {
        // Regex admin invalide — on laisse passer (serveur tranchera).
      }
    }
    return null;
  }

  async function handleSubmit(): Promise<void> {
    setError(null);
    const clientErr = validateClient(number);
    if (clientErr) {
      setError(clientErr);
      return;
    }
    const serverErr = await onSubmit(number.trim());
    if (serverErr) setError(serverErr);
    else setNumber('');
  }

  return (
    <>
      <div
        className="mp-modal-backdrop"
        role="presentation"
        onClick={loading ? undefined : onClose}
      />
      <div
        className="mp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="license-modal-title"
      >
        <h2 id="license-modal-title" className="mp-modal-title">
          Numéro de licence existante
        </h2>
        <p className="mp-hint mp-modal-lede">
          Saisissez le numéro de votre licence {fee.label} déjà en cours
          pour la saison. Vous éviterez d'être facturé d'une nouvelle.
        </p>

        {fee.licenseNumberFormatHint ? (
          <p
            className="mp-hint"
            style={{
              padding: '8px 12px',
              background: '#e0f2fe',
              borderRadius: 6,
              border: '1px solid #bae6fd',
              color: '#0369a1',
              marginTop: 8,
              marginBottom: 8,
            }}
          >
            ℹ️ Format : {fee.licenseNumberFormatHint}
          </p>
        ) : null}

        <label className="mp-field">
          <span>Numéro de licence</span>
          <input
            type="text"
            value={number}
            onChange={(e) => {
              setNumber(e.target.value.toUpperCase());
              if (error) setError(null);
            }}
            placeholder="ex. 10093219Q"
            autoFocus
            style={{ fontFamily: 'monospace' }}
          />
        </label>

        {error ? (
          <p className="mp-form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mp-modal-actions">
          <button
            type="button"
            className="mp-btn mp-btn-outline"
            disabled={loading}
            onClick={onClose}
          >
            Annuler
          </button>
          <button
            type="button"
            className="mp-btn mp-btn-primary"
            disabled={loading || number.trim().length === 0}
            onClick={() => void handleSubmit()}
          >
            {loading ? 'Vérification…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </>
  );
}
