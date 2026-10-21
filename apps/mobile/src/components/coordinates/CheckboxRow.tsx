import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, spacing, typography } from '../../lib/theme';

/** Case à cocher avec libellé (et détail facultatif en dessous). */
export function CheckboxRow({
  label,
  detail,
  checked,
  onToggle,
  disabled = false,
}: {
  label: string;
  detail?: string | null;
  checked: boolean;
  onToggle: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => !disabled && onToggle(!checked)}
      style={[styles.row, disabled && styles.disabled]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      hitSlop={4}
    >
      <Ionicons
        name={checked ? 'checkbox' : 'square-outline'}
        size={22}
        color={checked ? palette.primary : palette.muted}
      />
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  disabled: { opacity: 0.5 },
  text: { flex: 1, gap: 2 },
  label: { ...typography.smallStrong, color: palette.body },
  detail: { ...typography.small, color: palette.muted },
});
