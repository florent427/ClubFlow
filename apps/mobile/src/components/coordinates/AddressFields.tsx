import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  addressSearchUrl,
  mapAddressResponse,
  type AddressSuggestion,
  type AddressValue,
} from '../../lib/coordinates';
import { spacing } from '../../lib/theme';
import { TextField } from '../ui';
import { FieldError } from './FieldError';
import { SuggestionList } from './SuggestionList';
import { useGeoSuggestions } from './useGeoSuggestions';

/**
 * Adresse postale : autocomplétion IGN Géoplateforme sur la ligne
 * d'adresse (le choix remplit aussi code postal et ville), saisie libre
 * toujours possible — adresse à l'étranger, voie absente de la base.
 */
export function AddressFields({
  value,
  onChange,
  error,
  editable = true,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  error?: string | null;
  editable?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const { items, loading, clear, skipNext } = useGeoSuggestions(
    value.addressLine,
    addressSearchUrl,
    mapAddressResponse,
    focused && editable,
  );

  function pick(s: AddressSuggestion) {
    skipNext(s.addressLine);
    clear();
    onChange({
      addressLine: s.addressLine,
      postalCode: s.postalCode || value.postalCode,
      city: s.city || value.city,
    });
  }

  return (
    <View style={styles.wrap}>
      <TextField
        label="Adresse"
        value={value.addressLine}
        onChangeText={(addressLine) => onChange({ ...value, addressLine })}
        onFocus={() => setFocused(true)}
        // Délai : un appui sur une suggestion arrive après le blur.
        onBlur={() => setTimeout(() => setFocused(false), 250)}
        placeholder="N° et nom de rue"
        autoComplete="street-address"
        textContentType="fullStreetAddress"
        editable={editable}
      />
      {focused ? (
        <SuggestionList
          items={items}
          loading={loading}
          keyOf={(s) => s.label}
          labelOf={(s) => s.label}
          onPick={pick}
        />
      ) : null}
      <View style={styles.row}>
        <TextField
          label="Code postal"
          value={value.postalCode}
          onChangeText={(postalCode) => onChange({ ...value, postalCode })}
          keyboardType="number-pad"
          autoComplete="postal-code"
          textContentType="postalCode"
          editable={editable}
          containerStyle={styles.postal}
        />
        <TextField
          label="Ville"
          value={value.city}
          onChangeText={(city) => onChange({ ...value, city })}
          autoCapitalize="words"
          textContentType="addressCity"
          editable={editable}
          containerStyle={styles.city}
        />
      </View>
      <FieldError message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  postal: { width: 120 },
  city: { flex: 1 },
});
