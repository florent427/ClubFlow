import { type ComponentProps, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { palette, radius, spacing, tapTarget, typography } from '../../lib/theme';

type Props = ComponentProps<typeof TextInput> & {
  label?: string;
  hint?: string;
  error?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
  leftAdornment?: ReactNode;
  rightAdornment?: ReactNode;
};

/**
 * Champ texte unifié — label + input + hint/error en dessous.
 * Hauteur min adaptée au tap target (input single-line).
 */
export function TextField({
  label,
  hint,
  error,
  containerStyle,
  leftAdornment,
  rightAdornment,
  multiline,
  style,
  ...inputProps
}: Props) {
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.inputWrap,
          multiline && styles.inputWrapMultiline,
          error ? styles.inputWrapError : null,
        ]}
      >
        {leftAdornment}
        <TextInput
          {...inputProps}
          multiline={multiline}
          placeholderTextColor={palette.mutedSoft}
          style={[styles.input, multiline ? styles.inputMultiline : null, style]}
        />
        {rightAdornment}
      </View>
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: {
    ...typography.smallStrong,
    color: palette.body,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: tapTarget,
  },
  inputWrapMultiline: { alignItems: 'flex-start', paddingVertical: spacing.sm },
  inputWrapError: { borderColor: palette.danger },
  input: {
    flex: 1,
    ...typography.body,
    color: palette.ink,
    paddingVertical: spacing.sm,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  hint: { ...typography.small, color: palette.muted },
  errorText: { ...typography.small, color: palette.danger },
});
