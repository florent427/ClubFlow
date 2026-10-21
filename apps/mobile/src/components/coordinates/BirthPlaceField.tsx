import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  FRENCH_DOM_CODES,
  communeSearchUrl,
  countryByCode,
  mapCommuneResponse,
  type BirthPlaceValue,
  type CommuneSuggestion,
} from '../../lib/coordinates';
import { palette, radius, spacing, tapTarget, typography } from '../../lib/theme';
import { TextField } from '../ui';
import { CheckboxRow } from './CheckboxRow';
import { CountryPickerModal } from './CountryPickerModal';
import { FieldError } from './FieldError';
import { SuggestionList } from './SuggestionList';
import { useGeoSuggestions } from './useGeoSuggestions';

/**
 * Lieu de naissance. En France (DOM inclus) : autocomplétion des communes
 * geo.api.gouv.fr, affichées « Saint-Pierre (974) », code INSEE retenu ;
 * une commune absente du référentiel (fusionnée…) se saisit librement,
 * sans code. Case « Né(e) à l'étranger » : pays en liste + ville libre.
 */
export function BirthPlaceField({
  value,
  onChange,
  error,
  editable = true,
}: {
  value: BirthPlaceValue;
  onChange: (next: BirthPlaceValue) => void;
  error?: string | null;
  editable?: boolean;
}) {
  const abroad = value.birthCountryCode !== 'FR';
  const [focused, setFocused] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { items, loading, clear, skipNext } = useGeoSuggestions(
    value.birthCity,
    communeSearchUrl,
    mapCommuneResponse,
    focused && editable && !abroad,
  );

  function pick(c: CommuneSuggestion) {
    skipNext(c.nom);
    clear();
    onChange({
      birthCity: c.nom,
      birthCityInseeCode: c.code,
      birthCountryCode: 'FR',
    });
  }

  function toggleAbroad(next: boolean) {
    clear();
    onChange({
      birthCity: '',
      birthCityInseeCode: null,
      birthCountryCode: next ? '' : 'FR',
    });
  }

  const country = countryByCode(value.birthCountryCode);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Lieu de naissance</Text>
      <CheckboxRow
        label="Né(e) à l'étranger"
        checked={abroad}
        onToggle={toggleAbroad}
        disabled={!editable}
      />
      {abroad ? (
        <>
          <Pressable
            style={styles.select}
            onPress={() => editable && setPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Pays de naissance"
          >
            <Text style={country ? styles.selectText : styles.placeholder}>
              {country ? `${country.flag}  ${country.name}` : 'Pays de naissance'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={palette.muted} />
          </Pressable>
          <TextField
            label="Ville de naissance"
            value={value.birthCity}
            onChangeText={(birthCity) =>
              onChange({ ...value, birthCity, birthCityInseeCode: null })
            }
            autoCapitalize="words"
            editable={editable}
          />
          <CountryPickerModal
            visible={pickerOpen}
            title="Pays de naissance"
            selected={value.birthCountryCode}
            exclude={FRENCH_DOM_CODES}
            showDialCode={false}
            onSelect={(code) =>
              onChange({ ...value, birthCountryCode: code, birthCityInseeCode: null })
            }
            onClose={() => setPickerOpen(false)}
          />
        </>
      ) : (
        <>
          <TextField
            label="Ville de naissance"
            value={value.birthCity}
            // Saisie libre : le code INSEE ne vaut que pour une commune
            // choisie dans la liste.
            onChangeText={(birthCity) =>
              onChange({ birthCity, birthCityInseeCode: null, birthCountryCode: 'FR' })
            }
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 250)}
            placeholder="Commune (France, DOM inclus)"
            autoCapitalize="words"
            editable={editable}
            hint={
              value.birthCityInseeCode
                ? `Commune reconnue (code ${value.birthCityInseeCode}).`
                : 'Choisissez la commune dans la liste ; sinon, saisie libre.'
            }
          />
          {focused ? (
            <SuggestionList
              items={items}
              loading={loading}
              keyOf={(c) => c.code}
              labelOf={(c) => c.label}
              onPick={pick}
            />
          ) : null}
        </>
      )}
      <FieldError message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { ...typography.smallStrong, color: palette.body },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: tapTarget,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
  },
  selectText: { ...typography.body, color: palette.ink },
  placeholder: { ...typography.body, color: palette.mutedSoft },
});
