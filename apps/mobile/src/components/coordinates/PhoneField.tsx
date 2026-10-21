import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import {
  PRIORITY_COUNTRY_CODES,
  countryByCode,
  formatNationalInput,
  mobilePhoneError,
  splitInternationalInput,
  splitStoredPhone,
  toE164,
} from '../../lib/coordinates';
import { palette, radius, spacing, typography } from '../../lib/theme';
import { TextField } from '../ui';
import { CountryPickerModal } from './CountryPickerModal';

/**
 * Portable international : indicatif choisi dans une liste avec drapeau
 * (La Réunion et France en tête), formatage à la frappe, valeur émise en
 * E.164 (`+262692123456`) — '' tant que la saisie ne forme pas un numéro.
 *
 * Un ancien numéro sans indicatif est pré-rempli en devinant le pays :
 * 0692 / 0693 / 0262 → La Réunion, 0639 / 0269 → Mayotte, sinon France.
 */
export function PhoneField({
  label = 'Portable',
  value,
  onChange,
  error,
  hint,
  editable = true,
}: {
  label?: string;
  /** E.164, ou ancien numéro national à reprendre. */
  value: string;
  onChange: (e164: string) => void;
  /** Erreur imposée par le parent (ex. à la soumission). */
  error?: string | null;
  hint?: string;
  editable?: boolean;
}) {
  const initial = splitStoredPhone(value);
  const [country, setCountry] = useState(initial.country);
  const [national, setNational] = useState(initial.national);
  const [touched, setTouched] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Dernière valeur émise : un `value` différent vient du parent
  // (pré-remplissage asynchrone) et doit être repris dans le champ.
  const lastEmitted = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (value === lastEmitted.current) return;
    const next = splitStoredPhone(value);
    setCountry(next.country);
    setNational(next.national);
    // Un ancien numéro national est normalisé en E.164 dès le
    // pré-remplissage : c'est cette forme que l'API accepte.
    const e164 = toE164(next.national, next.country);
    lastEmitted.current = e164;
    if (e164 !== value) onChangeRef.current(e164);
  }, [value]);

  function emit(nextNational: string, nextCountry: string) {
    const e164 = toE164(nextNational, nextCountry);
    lastEmitted.current = e164;
    onChangeRef.current(e164);
  }

  function onChangeText(text: string) {
    if (text.trim().startsWith('+')) {
      // Numéro international collé ou tapé : on en déduit le pays.
      const intl = splitInternationalInput(text);
      if (intl) {
        setCountry(intl.country);
        setNational(intl.national);
        emit(intl.national, intl.country);
        return;
      }
      // Trop court pour être reconnu : valeur non vide mais invalide, pour
      // que le parent ne la prenne pas pour un effacement.
      const raw = `+${text.replace(/\D/g, '')}`;
      setNational(text);
      lastEmitted.current = raw;
      onChangeRef.current(raw);
      return;
    }
    let digits = text.replace(/\D/g, '');
    const prevDigits = national.replace(/\D/g, '');
    // Effacement d'un espace de mise en forme : sans ce correctif, le
    // formatage le remettrait aussitôt et la touche semblerait bloquée.
    if (text.length < national.length && digits === prevDigits) {
      digits = digits.slice(0, -1);
    }
    const formatted = formatNationalInput(digits, country);
    setNational(formatted);
    emit(formatted, country);
  }

  function onPickCountry(code: string) {
    setCountry(code);
    const formatted = formatNationalInput(national, code);
    setNational(formatted);
    emit(formatted, code);
  }

  const localError =
    touched && national.trim()
      ? mobilePhoneError(toE164(national, country))
      : null;
  const selected = countryByCode(country);

  return (
    <>
      <TextField
        label={label}
        value={national}
        onChangeText={onChangeText}
        onBlur={() => setTouched(true)}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        placeholder={country === 'RE' ? '0692 12 34 56' : '06 12 34 56 78'}
        editable={editable}
        error={error ?? localError}
        hint={hint}
        leftAdornment={
          <Pressable
            onPress={() => editable && setPickerOpen(true)}
            style={styles.countryBtn}
            accessibilityRole="button"
            accessibilityLabel={`Indicatif : ${selected?.name ?? country}`}
            hitSlop={6}
          >
            <Text style={styles.flag}>{selected?.flag ?? ''}</Text>
            <Text style={styles.dial}>{selected?.dialCode ?? ''}</Text>
            <Ionicons name="chevron-down" size={14} color={palette.muted} />
          </Pressable>
        }
      />
      <CountryPickerModal
        visible={pickerOpen}
        title="Indicatif du pays"
        selected={country}
        priority={PRIORITY_COUNTRY_CODES}
        onSelect={onPickCountry}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingRight: spacing.sm,
    marginRight: spacing.xs,
    borderRightWidth: 1,
    borderRightColor: palette.border,
    borderRadius: radius.sm,
  },
  flag: { fontSize: 20 },
  dial: { ...typography.smallStrong, color: palette.body },
});
