import PhoneInput from 'react-phone-number-input';
import fr from 'react-phone-number-input/locale/fr.json';
import 'react-phone-number-input/style.css';
import { isValidMobile, PHONE_COUNTRY_ORDER } from '../../lib/coordinates';

interface Props {
  label?: string;
  /** Valeur E.164, ou vide. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Portable : indicatif choisi dans une liste avec drapeau (Réunion et
 * métropole en tête), numéro saisi en format national, valeur émise en E.164.
 */
export function PhoneField({ label = 'Portable', value, onChange, disabled }: Props) {
  const invalid = value !== '' && !isValidMobile(value);
  return (
    <label className="mp-field mp-phone-field">
      <span>{label}</span>
      <PhoneInput
        value={value || undefined}
        onChange={(v) => onChange(v ?? '')}
        defaultCountry="RE"
        countryOptionsOrder={[...PHONE_COUNTRY_ORDER]}
        labels={fr}
        disabled={disabled}
        autoComplete="tel"
        placeholder="0692 12 34 56"
        aria-invalid={invalid}
      />
      {invalid ? (
        <small className="mp-hint mp-hint--warn">
          Numéro de portable invalide pour le pays choisi.
        </small>
      ) : null}
    </label>
  );
}
