import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { palette, radius, shadow, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { useClubTheme } from '../../theme/theme-context';

type Tone = 'primary' | 'cool' | 'warm' | 'success' | 'danger' | 'admin';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  /** Optionnel : pourcentage de variation (ex: +12% / -3%). */
  delta?: { value: string; positive: boolean } | null;
  tone?: Tone;
  compact?: boolean;
};

/**
 * Tuile KPI premium : icône gradient + label uppercase + métric grande
 * + delta optionnel coloré sémantiquement.
 */
export function KpiTile({
  icon,
  label,
  value,
  delta,
  tone = 'primary',
  compact = false,
}: Props) {
  const { gradients } = useClubTheme();
  const grad =
    tone === 'cool'
      ? gradients.cool
      : tone === 'warm' || tone === 'danger'
        ? gradients.warm
        : tone === 'success'
          ? { colors: ['#10b981', '#059669'] as const, start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }
          : tone === 'admin'
            ? { colors: ['#1e1b4b', '#b45309'] as const, start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }
            : gradients.primary;

  return (
    <View style={[styles.tile, compact && styles.tileCompact]}>
      <LinearGradient
        colors={grad.colors as readonly [string, string, ...string[]]}
        start={grad.start}
        end={grad.end}
        style={[styles.iconBubble, compact && styles.iconBubbleCompact]}
      >
        <Ionicons
          name={icon}
          size={compact ? 18 : 22}
          color={palette.surface}
        />
      </LinearGradient>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.value, compact && styles.valueCompact]} numberOfLines={1}>
        {value}
      </Text>
      {delta ? (
        <Text
          style={[
            styles.delta,
            { color: delta.positive ? palette.successText : palette.dangerText },
          ]}
        >
          {delta.positive ? '↑' : '↓'} {delta.value}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: palette.surface,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    minWidth: 140,
    flex: 1,
    ...shadow.sm,
  },
  tileCompact: {
    padding: spacing.md,
    minWidth: 110,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  iconBubbleCompact: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginBottom: spacing.xs,
  },
  label: {
    ...typography.eyebrow,
    color: palette.muted,
    marginBottom: spacing.xs,
  },
  value: {
    ...typography.metric,
    color: palette.ink,
  },
  valueCompact: {
    ...typography.h2,
  },
  delta: {
    ...typography.smallStrong,
    marginTop: spacing.xs,
  },
});
