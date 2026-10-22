import { getCountries } from 'libphonenumber-js';
import { useEffect, useId, useMemo, useState } from 'react';
import { AutocompleteInput } from './AutocompleteInput';
import { searchCommunes } from './geo-api';
import './coordinates.css';

export type BirthPlaceValue = {
  birthCity: string;
  /** Code INSEE ; vide si saisie libre ou hors de France. */
  birthCityInseeCode: string;
  /** ISO 3166-1 alpha-2 ; vide tant que rien n'est saisi. */
  birthCountryCode: string;
};

let countryOptionsCache: { code: string; name: string }[] | null = null;

/** Pays (hors France) triés par nom français. */
function foreignCountryOptions(): { code: string; name: string }[] {
  if (countryOptionsCache) return countryOptionsCache;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(['fr'], { type: 'region' });
  } catch {
    names = null;
  }
  countryOptionsCache = getCountries()
    .filter((c) => c !== 'FR')
    .map((code) => ({ code, name: names?.of(code) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return countryOptionsCache;
}

/**
 * Lieu de naissance. France (DOM inclus) : commune en autocomplétion
 * geo.api.gouv.fr, code INSEE retenu ; saisie libre permise (INSEE vide).
 * Étranger : pays en liste + ville en texte libre.
 */
export function BirthPlaceField({
  value,
  onChange,
  label = 'Lieu de naissance',
}: {
  value: BirthPlaceValue;
  onChange: (next: BirthPlaceValue) => void;
  label?: string;
}) {
  const baseId = useId();
  const [abroad, setAbroad] = useState(
    Boolean(value.birthCountryCode) && value.birthCountryCode !== 'FR',
  );
  useEffect(() => {
    // Un pays vide (case tout juste cochée) ne change pas le mode choisi.
    if (value.birthCountryCode) setAbroad(value.birthCountryCode !== 'FR');
  }, [value.birthCountryCode]);
  const countries = useMemo(() => foreignCountryOptions(), []);

  return (
    <div className="field cf-birthplace">
      <span>{label}</span>
      <label className="field field--checkbox cf-birthplace__abroad">
        <input
          type="checkbox"
          checked={abroad}
          onChange={(e) => {
            const next = e.target.checked;
            setAbroad(next);
            onChange({
              birthCity: value.birthCity,
              birthCityInseeCode: '',
              birthCountryCode: next ? '' : value.birthCity.trim() ? 'FR' : '',
            });
          }}
        />
        <span>Né(e) à l’étranger</span>
      </label>
      {abroad ? (
        <div className="cf-address__row">
          <label className="field cf-birthplace__country">
            <span>Pays de naissance</span>
            <select
              value={value.birthCountryCode}
              onChange={(e) =>
                onChange({
                  ...value,
                  birthCityInseeCode: '',
                  birthCountryCode: e.target.value,
                })
              }
            >
              <option value="">— Choisir —</option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field cf-address__city">
            <span>Ville de naissance</span>
            <input
              value={value.birthCity}
              onChange={(e) =>
                onChange({
                  ...value,
                  birthCity: e.target.value,
                  birthCityInseeCode: '',
                })
              }
            />
          </label>
        </div>
      ) : (
        <div className="field">
          <label htmlFor={`${baseId}-commune`} className="cf-sr-only">
            Commune de naissance
          </label>
          <AutocompleteInput
            id={`${baseId}-commune`}
            value={value.birthCity}
            onChange={(birthCity) =>
              onChange({
                birthCity,
                birthCityInseeCode: '',
                birthCountryCode: birthCity.trim() ? 'FR' : '',
              })
            }
            fetchSuggestions={searchCommunes}
            getKey={(c) => c.code}
            renderLabel={(c) => `${c.nom} (${c.codeDepartement})`}
            onPick={(c) =>
              onChange({
                birthCity: c.nom,
                birthCityInseeCode: c.code,
                birthCountryCode: 'FR',
              })
            }
            minChars={2}
            placeholder="Commune — tapez pour chercher"
          />
          {value.birthCity.trim() && !value.birthCityInseeCode ? (
            <small className="cf-field-hint">
              Commune non choisie dans la liste : enregistrée sans code INSEE.
            </small>
          ) : null}
        </div>
      )}
    </div>
  );
}
