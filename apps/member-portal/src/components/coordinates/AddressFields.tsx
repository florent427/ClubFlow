import { useState } from 'react';
import {
  searchAddresses,
  type AddressSuggestion,
  type AddressValue,
} from '../../lib/coordinates';
import { useSuggestions } from './useSuggestions';

interface Props {
  value: AddressValue;
  onChange: (value: AddressValue) => void;
  disabled?: boolean;
}

/**
 * Adresse complète : rue avec suggestions de la Base Adresse Nationale,
 * code postal et ville remplis par la suggestion choisie. La saisie libre
 * reste possible (adresse hors de France, voie récente absente).
 */
export function AddressFields({ value, onChange, disabled }: Props) {
  const [focused, setFocused] = useState(false);
  const [picked, setPicked] = useState(false);
  const suggestions = useSuggestions<AddressSuggestion>(
    value.addressLine,
    focused && !picked && !disabled,
    searchAddresses,
  );

  return (
    <div className="mp-address-fields">
      <label className="mp-field mp-autocomplete">
        <span>Adresse (numéro et voie)</span>
        <input
          type="text"
          value={value.addressLine}
          onChange={(e) => {
            setPicked(false);
            onChange({ ...value, addressLine: e.target.value });
          }}
          onFocus={() => setFocused(true)}
          // Différé : le clic sur une suggestion arrive après le blur.
          onBlur={() => window.setTimeout(() => setFocused(false), 150)}
          disabled={disabled}
          autoComplete="street-address"
          placeholder="12 rue des Flamboyants"
        />
        {suggestions.length > 0 ? (
          <ul className="mp-autocomplete__list" role="listbox">
            {suggestions.map((s) => (
              <li key={s.label}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setPicked(true);
                    onChange({
                      addressLine: s.addressLine,
                      postalCode: s.postalCode,
                      city: s.city,
                    });
                  }}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </label>
      <div className="mp-address-fields__row">
        <label className="mp-field">
          <span>Code postal</span>
          <input
            type="text"
            value={value.postalCode}
            onChange={(e) => onChange({ ...value, postalCode: e.target.value })}
            disabled={disabled}
            autoComplete="postal-code"
            inputMode="numeric"
          />
        </label>
        <label className="mp-field">
          <span>Ville</span>
          <input
            type="text"
            value={value.city}
            onChange={(e) => onChange({ ...value, city: e.target.value })}
            disabled={disabled}
            autoComplete="address-level2"
          />
        </label>
      </div>
    </div>
  );
}
