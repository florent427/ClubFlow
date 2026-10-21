import { useId, useMemo } from 'react';
import PhoneInput from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';
import fr from 'react-phone-number-input/locale/fr';
import 'react-phone-number-input/style.css';
import { phoneToE164Guess } from './phone';
import './coordinates.css';

/**
 * Portable avec sélecteur d'indicatif (drapeaux embarqués, aucun appel
 * externe), La Réunion et la France en tête. Émet du E.164 (`+262692…`).
 * Un ancien numéro stocké sans indicatif est affiché converti d'après son
 * préfixe (0692 → La Réunion…) ; il n'est réécrit que si la fiche est
 * enregistrée.
 */
export function PhoneField({
  value,
  onChange,
  label = 'Portable',
  required = false,
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  required?: boolean;
}) {
  const id = useId();
  const raw = value.trim();
  const e164 = useMemo(() => phoneToE164Guess(raw), [raw]);
  const legacyUnparsed = raw !== '' && !raw.startsWith('+') && !e164;
  const legacyConverted = raw !== '' && !raw.startsWith('+') && Boolean(e164);

  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required ? ' *' : ''}
      </label>
      <PhoneInput
        id={id}
        className="cf-phone"
        value={e164 ?? undefined}
        onChange={(v) => onChange(v ?? '')}
        defaultCountry="RE"
        countryOptionsOrder={['RE', 'FR', '|', '...']}
        labels={fr}
        flags={flags}
        addInternationalOption={false}
        autoComplete="tel"
      />
      {legacyConverted ? (
        <small className="cf-field-hint">
          Ancien numéro « {raw} » : indicatif déduit, à vérifier.
        </small>
      ) : null}
      {legacyUnparsed ? (
        <small className="cf-field-hint cf-field-hint--warn">
          Numéro enregistré non reconnu : « {raw} ». Ressaisissez-le avec
          l’indicatif.
        </small>
      ) : null}
    </div>
  );
}
