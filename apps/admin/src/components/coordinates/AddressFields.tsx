import { useId } from 'react';
import { AutocompleteInput } from './AutocompleteInput';
import { searchAddresses } from './geo-api';
import './coordinates.css';

export type AddressValue = {
  addressLine: string;
  postalCode: string;
  city: string;
};

/**
 * Adresse postale : rue avec autocomplétion (Géoplateforme), code postal et
 * ville remplis au choix d'une suggestion, tous modifiables à la main.
 */
export function AddressFields({
  value,
  onChange,
  labels = {},
  required = false,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  labels?: Partial<Record<keyof AddressValue, string>>;
  required?: boolean;
}) {
  const baseId = useId();
  const req = required ? ' *' : '';
  return (
    <div className="cf-address">
      <div className="field">
        <label htmlFor={`${baseId}-line`}>
          {labels.addressLine ?? 'Adresse'}
          {req}
        </label>
        <AutocompleteInput
          id={`${baseId}-line`}
          value={value.addressLine}
          onChange={(addressLine) => onChange({ ...value, addressLine })}
          fetchSuggestions={searchAddresses}
          getKey={(s) => s.id}
          renderLabel={(s) => s.label}
          onPick={(s) =>
            onChange({
              addressLine: s.name,
              postalCode: s.postcode || value.postalCode,
              city: s.city || value.city,
            })
          }
          autoComplete="street-address"
          placeholder="N° et rue — tapez pour chercher"
        />
      </div>
      <div className="cf-address__row">
        <label className="field cf-address__postal">
          <span>
            {labels.postalCode ?? 'Code postal'}
            {req}
          </span>
          <input
            value={value.postalCode}
            onChange={(e) => onChange({ ...value, postalCode: e.target.value })}
            autoComplete="postal-code"
            inputMode="numeric"
          />
        </label>
        <label className="field cf-address__city">
          <span>
            {labels.city ?? 'Ville'}
            {req}
          </span>
          <input
            value={value.city}
            onChange={(e) => onChange({ ...value, city: e.target.value })}
            autoComplete="address-level2"
          />
        </label>
      </div>
    </div>
  );
}
