import { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AnimatedPressable } from './AnimatedPressable';
import {
  palette,
  radius,
  shadow,
  spacing,
  tapTarget,
  typography,
} from '../../lib/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'md' | 'sm' | 'lg';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/**
 * Bouton primaire de l'app — remplace tous les Pressable + Text dupliqués.
 * Tap target 48px minimum (norme Apple HIG / Android).
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  accessibilityLabel,
}: Props) {
  const styles = useStyles(variant, size, fullWidth);
  const isDisabled = disabled || loading;

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      haptic={variant === 'primary' || variant === 'danger'}
      style={[
        styles.base,
        variant === 'primary' && !isDisabled ? shadow.glowPrimary : null,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={styles.label.color} />
      ) : (
        <>
          {icon ? (
            <Ionicons
              name={icon}
              size={size === 'sm' ? 16 : 18}
              color={styles.label.color}
            />
          ) : null}
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
          {iconRight ? (
            <Ionicons
              name={iconRight}
              size={size === 'sm' ? 16 : 18}
              color={styles.label.color}
            />
          ) : null}
        </>
      )}
    </AnimatedPressable>
  );
}

function useStyles(variant: Variant, size: Size, fullWidth: boolean) {
  return useMemo(() => {
    const padH = size === 'sm' ? spacing.md : size === 'lg' ? spacing.xl : spacing.lg;
    const padV = size === 'sm' ? spacing.sm : size === 'lg' ? spacing.lg : spacing.md;
    const minH =
      size === 'sm' ? 36 : size === 'lg' ? 56 : tapTarget; // 36 acceptable pour boutons compacts dans un toolbar

    const labelTypo =
      size === 'sm'
        ? typography.smallStrong
        : size === 'lg'
          ? { ...typography.bodyStrong, fontSize: 16 }
          : typography.bodyStrong;

    const variants: Record<
      Variant,
      { bg: string; border: string; text: string }
    > = {
      primary: {
        bg: palette.primary,
        border: palette.primary,
        text: '#ffffff',
      },
      secondary: {
        bg: palette.primaryLight,
        border: palette.primaryLight,
        text: palette.primary,
      },
      ghost: {
        bg: 'transparent',
        border: palette.borderStrong,
        text: palette.body,
      },
      danger: {
        bg: palette.danger,
        border: palette.danger,
        text: '#ffffff',
      },
      subtle: {
        bg: palette.bgAlt,
        border: palette.bgAlt,
        text: palette.inkSoft,
      },
    };
    const v = variants[variant];

    return StyleSheet.create({
      base: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: v.bg,
        borderColor: v.border,
        borderWidth: 1,
        borderRadius: radius.md,
        paddingHorizontal: padH,
        paddingVertical: padV,
        minHeight: minH,
        ...(fullWidth ? { width: '100%' as const } : {}),
      },
      label: {
        color: v.text,
        ...labelTypo,
      },
      disabled: { opacity: 0.4 },
    });
  }, [variant, size, fullWidth]);
}
