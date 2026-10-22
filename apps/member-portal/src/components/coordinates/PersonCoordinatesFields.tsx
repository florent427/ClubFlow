import {
  addressOf,
  isAddressComplete,
  isValidMobile,
  type AddressValue,
  type Coordinates,
} from '../../lib/coordinates';
import { AddressFields } from './AddressFields';
import { PhoneField } from './PhoneField';

export type PersonCoordinatesValue = {
  sameAddress: boolean;
  samePhone: boolean;
  address: AddressValue;
  phone: string;
};

/** État initial : reprend le compte quand il est complet, sinon saisie propre. */
export function initialPersonCoordinates(
  account: Coordinates | null | undefined,
  current?: Partial<Coordinates> | null,
): PersonCoordinatesValue {
  const accountAddressOk = isAddressComplete(addressOf(account));
  const accountPhoneOk = isValidMobile(account?.phone);
  const hasOwnAddress = isAddressComplete(addressOf(current));
  const hasOwnPhone = isValidMobile(current?.phone);
  return {
    sameAddress: accountAddressOk && !hasOwnAddress,
    samePhone: accountPhoneOk && !hasOwnPhone,
    address: addressOf(current),
    phone: hasOwnPhone ? (current?.phone ?? '') : '',
  };
}

/** Valeurs à envoyer : celles du compte pour chaque case cochée. */
export function resolvePersonCoordinates(
  v: PersonCoordinatesValue,
  account: Coordinates | null | undefined,
): { phone: string } & AddressValue {
  const address = v.sameAddress ? addressOf(account) : v.address;
  return {
    phone: v.samePhone ? (account?.phone ?? '') : v.phone,
    addressLine: address.addressLine.trim(),
    postalCode: address.postalCode.trim(),
    city: address.city.trim(),
  };
}

export function personCoordinatesError(
  v: PersonCoordinatesValue,
  account: Coordinates | null | undefined,
): string | null {
  const r = resolvePersonCoordinates(v, account);
  if (!isValidMobile(r.phone)) {
    return 'Portable obligatoire : choisissez l’indicatif du pays puis saisissez le numéro.';
  }
  if (!isAddressComplete(r)) {
    return 'Adresse complète obligatoire (rue, code postal et ville).';
  }
  return null;
}

interface Props {
  account: Coordinates | null | undefined;
  value: PersonCoordinatesValue;
  onChange: (value: PersonCoordinatesValue) => void;
  disabled?: boolean;
}

/**
 * Adresse et portable d'un adhérent du foyer, avec deux cases séparées pour
 * reprendre ceux du compte. Les valeurs sont copiées à l'envoi : modifier le
 * compte plus tard ne modifie pas la fiche de l'adhérent.
 */
export function PersonCoordinatesFields({ account, value, onChange, disabled }: Props) {
  const accountAddress = addressOf(account);
  const canReuseAddress = isAddressComplete(accountAddress);
  const canReusePhone = isValidMobile(account?.phone);

  return (
    <fieldset className="mp-fieldset">
      <legend className="mp-legend">Coordonnées</legend>

      {canReuseAddress ? (
        <label className="mp-checkbox">
          <input
            type="checkbox"
            checked={value.sameAddress}
            onChange={(e) => onChange({ ...value, sameAddress: e.target.checked })}
            disabled={disabled}
          />
          <span>
            Même adresse que le compte
            <small className="mp-hint mp-coordinates-reuse">
              {accountAddress.addressLine}, {accountAddress.postalCode}{' '}
              {accountAddress.city}
            </small>
          </span>
        </label>
      ) : null}
      {!value.sameAddress || !canReuseAddress ? (
        <AddressFields
          value={value.address}
          onChange={(address) => onChange({ ...value, address })}
          disabled={disabled}
        />
      ) : null}

      {canReusePhone ? (
        <label className="mp-checkbox">
          <input
            type="checkbox"
            checked={value.samePhone}
            onChange={(e) => onChange({ ...value, samePhone: e.target.checked })}
            disabled={disabled}
          />
          <span>
            Même portable que le compte
            <small className="mp-hint mp-coordinates-reuse">{account?.phone}</small>
          </span>
        </label>
      ) : null}
      {!value.samePhone || !canReusePhone ? (
        <PhoneField
          value={value.phone}
          onChange={(phone) => onChange({ ...value, phone })}
          disabled={disabled}
        />
      ) : null}
    </fieldset>
  );
}
