import { StyleSheet, View } from 'react-native';
import {
  addressSummary,
  phoneDisplay,
  type CoordinatesErrors,
  type CoordinatesGraph,
  type PersonCoordinatesDraft,
} from '../../lib/coordinates';
import { spacing } from '../../lib/theme';
import { AddressFields } from './AddressFields';
import { BirthPlaceField } from './BirthPlaceField';
import { CheckboxRow } from './CheckboxRow';
import { PhoneField } from './PhoneField';

/**
 * Coordonnées d'une personne du foyer : lieu de naissance (si exigé),
 * portable et adresse, avec les cases « Même portable / Même adresse que
 * le compte » quand le compte payeur est complet. Une case cochée masque
 * le champ : ce sont les valeurs du compte qui partiront.
 */
export function PersonCoordinatesForm({
  draft,
  onChange,
  account,
  offerSameAsAccount,
  showBirthPlace,
  errors,
}: {
  draft: PersonCoordinatesDraft;
  onChange: (next: PersonCoordinatesDraft) => void;
  account: CoordinatesGraph | null;
  offerSameAsAccount: boolean;
  showBirthPlace: boolean;
  errors?: CoordinatesErrors | null;
}) {
  const samePhone = offerSameAsAccount && draft.samePhone;
  const sameAddress = offerSameAsAccount && draft.sameAddress;

  return (
    <View style={styles.wrap}>
      {showBirthPlace ? (
        <BirthPlaceField
          value={draft.birthPlace}
          onChange={(birthPlace) => onChange({ ...draft, birthPlace })}
          error={errors?.birthPlace}
        />
      ) : null}

      {offerSameAsAccount ? (
        <CheckboxRow
          label="Même portable que le compte"
          detail={samePhone ? phoneDisplay(account?.phone) : null}
          checked={draft.samePhone}
          onToggle={(next) => onChange({ ...draft, samePhone: next })}
        />
      ) : null}
      {samePhone ? null : (
        <PhoneField
          value={draft.phone}
          onChange={(phone) => onChange({ ...draft, phone })}
          error={errors?.phone}
        />
      )}

      {offerSameAsAccount ? (
        <CheckboxRow
          label="Même adresse que le compte"
          detail={sameAddress ? addressSummary(account) : null}
          checked={draft.sameAddress}
          onToggle={(next) => onChange({ ...draft, sameAddress: next })}
        />
      ) : null}
      {sameAddress ? null : (
        <AddressFields
          value={draft.address}
          onChange={(address) => onChange({ ...draft, address })}
          error={errors?.address}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
});
