import { type ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients, radius, shadow, spacing } from '../../lib/theme';

type Props = {
  children: ReactNode;
  gradient?: keyof typeof gradients;
  /** Padding du contenu (par défaut spacing.xl). */
  padding?: number;
  /** Rayon de la carte (par défaut radius.xl). */
  borderRadius?: number;
  /** Glow d'ombre teintée (correspond au gradient). */
  glow?: 'primary' | 'accent' | 'none';
  style?: StyleProp<ViewStyle>;
  /**
   * Décor optionnel — un ReactNode positionné en absolu derrière le
   * contenu (ex : cercles abstraits pour pattern de hero).
   */
  decoration?: ReactNode;
};

/**
 * Carte avec dégradé en background + ombre profonde teintée.
 * Idéal pour les hero sections (Dashboard) ou les CTAs premium.
 */
export function GradientCard({
  children,
  gradient = 'primary',
  padding = spacing.xl,
  borderRadius = radius.xl,
  glow = 'primary',
  style,
  decoration,
}: Props) {
  const glowStyle =
    glow === 'primary'
      ? shadow.glowPrimary
      : glow === 'accent'
        ? shadow.glowAccent
        : shadow.lg;
  const grad = gradients[gradient];
  return (
    <View style={[glowStyle, style]}>
      <LinearGradient
        colors={grad.colors}
        start={grad.start}
        end={grad.end}
        style={[
          styles.card,
          { borderRadius, padding },
        ]}
      >
        {decoration ? (
          <View style={styles.decoration} pointerEvents="none">
            {decoration}
          </View>
        ) : null}
        <View style={styles.content}>{children}</View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  decoration: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    position: 'relative',
    zIndex: 1,
  },
});
