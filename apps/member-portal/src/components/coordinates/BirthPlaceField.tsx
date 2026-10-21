import { useState } from 'react';
import {
  countryOptions,
  searchCommunes,
  type BirthPlaceValue,
  type CommuneSuggestion,
} from '../../lib/coordinates';
import { useSuggestions } from './useSuggestions';

interface Props {
  value: BirthPlaceValue;
  onChange: (value: BirthPlaceValue) => void;
  disabled?: boolean;
}

/**
 * Ville de naissance. En France (DOM compris), la commune est proposée par
 * le référentiel officiel et son code INSEE conservé ; une commune absente
 * (ancienne commune fusionnée) se saisit librement. Né(e) à l'étranger :
 * pays en liste, ville en texte libre.
 */
export function BirthPlaceField({ value, onChange, disabled }: Props) {
  const abroad = value.birthCountryCode !== 'FR';
  const [focused, setFocused] = useState(false);
  const suggestions = useSuggestions<CommuneSuggestion>(
    value.birthCity,
    focused && !abroad && !value.birthCityInseeCode && !disabled,
    searchCommunes,
    2,
  );

  return (
    <div className="mp-birthplace">
      <label className="mp-checkbox">
        <input
          type="checkbox"
          checked={abroad}
          onChange={(e) =>
            onChange({
              birthCity: '',
              birthCityInseeCode: null,
              birthCountryCode: e.target.checked ? '' : 'FR',
            })
          }
          disabled={disabled}
        />
        <span>Né(e) à l&rsquo;étranger</span>
      </label>

      {abroad ? (
        <label className="mp-field">
          <span>Pays de naissance</span>
          <select
            value={value.birthCountryCode}
            onChange={(e) =>
              onChange({ ...value, birthCountryCode: e.target.value })
            }
            disabled={disabled}
          >
            <option value="">— Choisir —</option>
            {countryOptions()
              .filter((c) => c.code !== 'FR')
              .map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
      ) : null}

      <label className="mp-field mp-autocomplete">
        <span>Ville de naissance</span>
        <input
          type="text"
          value={value.birthCity}
          onChange={(e) =>
            // Toute frappe défait le choix : le code INSEE ne vaut que pour
            // le libellé exact proposé par le référentiel.
            onChange({ ...value, birthCity: e.target.value, birthCityInseeCode: null })
          }
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 150)}
          disabled={disabled}
          autoComplete="off"
          placeholder={abroad ? 'Ville' : 'Commencez à taper : Saint-Pierre…'}
        />
        {suggestions.length > 0 ? (
          <ul className="mp-autocomplete__list" role="listbox">
            {suggestions.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() =>
                    onChange({
                      birthCity: c.nom,
                      birthCityInseeCode: c.code,
                      birthCountryCode: 'FR',
                    })
                  }
                >
                  {c.nom} ({c.codeDepartement})
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {!abroad && value.birthCity.trim().length >= 2 && !value.birthCityInseeCode ? (
          <small className="mp-hint">
            Choisissez la commune dans la liste ; si elle n&rsquo;y figure pas,
            votre saisie sera conservée telle quelle.
          </small>
        ) : null}
      </label>
    </div>
  );
}
