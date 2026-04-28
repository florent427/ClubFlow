import { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from './AnimatedPressable';
import { gradients, palette, spacing, typography } from '../../lib/theme';

type Props = {
  /** Eyebrow uppercase au-dessus du titre. */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Bouton retour à gauche. Si false, pas de back. */
  showBack?: boolean;
  /** Action à droite (ex: avatar, bouton). */
  trailing?: ReactNode;
  /** Variante "compacte" pour les écrans secondaires (moins haut). */
  compact?: boolean;
  /** Override du gradient (par défaut "hero"). */
  gradient?: keyof typeof gradients;
  /** Padding horizontal — par défaut spacing.xl. */
  paddingHorizontal?: number;
  /** Contenu additionnel sous le titre (ex: chips, switcher). */
  children?: ReactNode;
  /** Si true, ajoute un padding bottom plus grand pour que le contenu
   *  de la page suivante puisse chevaucher (margin-top négatif). */
  overlap?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Hero gradient header réutilisable — pose la même identité visuelle
 * partout (Dashboard, Progression, Planning, Family, etc.).
 *
 * Variantes :
 *  - `compact` : header simple type page interne
 *  - `overlap` : padding bas plus grand pour permettre à la 1ʳᵉ card
 *    de la page de chevaucher le hero avec un margin-top négatif
 */
export function ScreenHero({
  eyebrow,
  title,
  subtitle,
  showBack = false,
  trailing,
  compact = false,
  gradient = 'hero',
  paddingHorizontal = spacing.xl,
  children,
  overlap = false,
  style,
}: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const grad = gradients[gradient];

  const paddingTop = insets.top + spacing.lg;
  const paddingBottom = overlap ? spacing.giant : compact ? spacing.xl : spacing.xxxl;

  return (
    <LinearGradient
      colors={grad.colors}
      start={grad.start}
      end={grad.end}
      style={[
        styles.hero,
        { paddingTop, paddingBottom, paddingHorizontal },
        style,
      ]}
    >
      {/* Cercles décoratifs en arrière-plan */}
      <View style={[styles.circle, styles.circle1]} />
      <View style={[styles.circle, styles.circle2]} />

      <View style={styles.topBar}>
        {showBack ? (
          <AnimatedPressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Retour"
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={22} color="#ffffff" />
          </AnimatedPressable>
        ) : (
          <View style={{ width: 44 }} />
        )}
        {trailing ?? <View style={{ width: 44 }} />}
      </View>

      <View style={[styles.brand, compact ? styles.brandCompact : null]}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={compact ? styles.titleCompact : styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    overflow: 'hidden',
  },
  circle: { position: 'absolute', borderRadius: 1000 },
  circle1: {
    width: 220,
    height: 220,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -60,
    right: -60,
  },
  circle2: {
    width: 160,
    height: 160,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: -40,
    left: -50,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { gap: spacing.xs, marginTop: spacing.sm },
  brandCompact: { marginTop: 0 },
  eyebrow: {
    ...typography.eyebrow,
    color: 'rgba(255,255,255,0.85)',
  },
  title: {
    ...typography.displayLg,
    color: '#ffffff',
    marginTop: spacing.xs,
  },
  titleCompact: {
    ...typography.h1,
    color: '#ffffff',
  },
  subtitle: {
    ...typography.body,
    color: 'rgba(255,255,255,0.85)',
    marginTop: spacing.xxs,
  },
});

export default ScreenHero;
