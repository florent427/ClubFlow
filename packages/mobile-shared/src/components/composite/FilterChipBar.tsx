import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { palette, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { useClubTheme } from '../../theme/theme-context';

export type FilterChip = {
  key: string;
  label: string;
  count?: number;
};

type Props = {
  chips: FilterChip[];
  activeKey: string | null;
  onSelect: (key: string | null) => void;
  /** Chip "Tout" en première position. */
  withAll?: boolean;
  allLabel?: string;
};

/**
 * Barre de filtres horizontale scrollable. Chip actif en gradient,
 * inactifs en surface plate.
 */
export function FilterChipBar({
  chips,
  activeKey,
  onSelect,
  withAll = true,
  allLabel = 'Tout',
}: Props) {
  const { gradients } = useClubTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {withAll ? (
        <Chip
          label={allLabel}
          active={activeKey === null}
          onPress={() => onSelect(null)}
          gradient={gradients.primary}
        />
      ) : null}
      {chips.map((c) => (
        <Chip
          key={c.key}
          label={c.label + (c.count != null ? ` · ${c.count}` : '')}
          active={activeKey === c.key}
          onPress={() => onSelect(c.key)}
          gradient={gradients.primary}
        />
      ))}
    </ScrollView>
  );
}

function Chip({
  label,
  active,
  onPress,
  gradient,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  gradient: { colors: readonly [string, string, ...string[]]; start: { x: number; y: number }; end: { x: number; y: number } };
}) {
  if (active) {
    return (
      <AnimatedPressable onPress={onPress} haptic>
        <LinearGradient
          colors={gradient.colors}
          start={gradient.start}
          end={gradient.end}
          style={[styles.chip, styles.chipActive]}
        >
          <Text style={[styles.chipText, styles.chipTextActive]}>
            {label}
          </Text>
        </LinearGradient>
      </AnimatedPressable>
    );
  }
  return (
    <AnimatedPressable onPress={onPress} haptic>
      <View style={styles.chip}>
        <Text style={styles.chipText}>{label}</Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  chipActive: {
    borderColor: 'transparent',
  },
  chipText: {
    ...typography.smallStrong,
    color: palette.body,
  },
  chipTextActive: {
    color: palette.surface,
  },
});
