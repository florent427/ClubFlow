import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AnimatedPressable } from './AnimatedPressable';
import { palette, radius, shadow, spacing, tapTarget } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { gradients } from '../../theme/gradients';

type Props = {
  label: string;
  onPress: () => void;
  /** Gradient à utiliser (par défaut "primary" indigo→violet). */
  gradient?: keyof typeof gradients;
  /** Ombre/glow associé au gradient. */
  glow?: 'primary' | 'accent' | 'none';
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
  accessibilityLabel?: string;
};

/**
 * Bouton premium avec dégradé linéaire + glow d'ombre teintée.
 * Utilisé pour les CTAs principaux (login, register, save profile).
 */
export function GradientButton({
  label,
  onPress,
  gradient = 'primary',
  glow = 'primary',
  icon,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  size = 'md',
  style,
  haptic = true,
  accessibilityLabel,
}: Props) {
  const isDisabled = disabled || loading;
  const padH = size === 'lg' ? spacing.xl : spacing.lg;
  const padV = size === 'lg' ? spacing.lg : spacing.md;
  const minH = size === 'lg' ? 56 : tapTarget;
  const labelStyle =
    size === 'lg'
      ? { ...typography.bodyStrong, fontSize: 16 }
      : typography.bodyStrong;
  const glowStyle =
    glow === 'primary'
      ? shadow.glowPrimary
      : glow === 'accent'
        ? shadow.glowAccent
        : shadow.none;
  const grad = gradients[gradient];

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={isDisabled}
      haptic={haptic}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        fullWidth ? styles.fullWidth : null,
        !isDisabled ? glowStyle : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
    >
      <LinearGradient
        colors={isDisabled ? [palette.mutedExtra, palette.muted] as readonly [string, string] : grad.colors}
        start={grad.start}
        end={grad.end}
        style={[
          styles.button,
          {
            paddingHorizontal: padH,
            paddingVertical: padV,
            minHeight: minH,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <View style={styles.row}>
            {icon ? (
              <Ionicons name={icon} size={18} color="#ffffff" />
            ) : null}
            <Text style={[styles.label, labelStyle]} numberOfLines={1}>
              {label}
            </Text>
            {iconRight ? (
              <Ionicons name={iconRight} size={18} color="#ffffff" />
            ) : null}
          </View>
        )}
      </LinearGradient>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  fullWidth: { width: '100%' },
  disabled: { opacity: 0.5 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: { color: '#ffffff' },
});
