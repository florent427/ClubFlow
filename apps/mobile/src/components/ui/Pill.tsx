import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { palette, radius, spacing, typography } from '../../lib/theme';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

type Props = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
  onPress?: () => void;
};

/** Pill / Chip — utilisé pour les badges de statut, grades, certificats. */
export function Pill({ label, icon, tone = 'neutral', onPress }: Props) {
  const styles = pillStyles[tone];
  const inner = (
    <View style={[base.row, styles.row]}>
      {icon ? (
        <Ionicons name={icon} size={14} color={styles.icon.color} />
      ) : null}
      <Text style={[base.label, styles.label]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [pressed && { opacity: 0.7 }]}
      >
        {inner}
      </Pressable>
    );
  }
  return inner;
}

const base = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  label: { ...typography.smallStrong, fontSize: 12 },
});

const pillStyles: Record<
  Tone,
  {
    row: { backgroundColor: string; borderColor: string };
    label: { color: string };
    icon: { color: string };
  }
> = {
  neutral: {
    row: { backgroundColor: palette.bgAlt, borderColor: palette.border },
    label: { color: palette.body },
    icon: { color: palette.muted },
  },
  primary: {
    row: { backgroundColor: palette.primaryLight, borderColor: '#bfdbfe' },
    label: { color: palette.primary },
    icon: { color: palette.primary },
  },
  success: {
    row: { backgroundColor: palette.successBg, borderColor: palette.successBorder },
    label: { color: '#15803d' },
    icon: { color: '#15803d' },
  },
  warning: {
    row: { backgroundColor: palette.warningBg, borderColor: palette.warningBorder },
    label: { color: '#92400e' },
    icon: { color: '#92400e' },
  },
  danger: {
    row: { backgroundColor: palette.dangerBg, borderColor: palette.dangerBorder },
    label: { color: '#991b1b' },
    icon: { color: '#991b1b' },
  },
  info: {
    row: { backgroundColor: palette.infoBg, borderColor: '#bae6fd' },
    label: { color: '#075985' },
    icon: { color: '#075985' },
  },
};
