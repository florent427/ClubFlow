import { type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { palette, radius, shadow, spacing, typography } from '../../lib/theme';

type Props = {
  title?: string;
  subtitle?: string;
  /** Action affichée à droite du titre (lien, icône, bouton compact). */
  headerRight?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** `flat` retire l'ombre — utile pour les cartes imbriquées. */
  flat?: boolean;
  /** Padding horizontal du contenu (par défaut spacing.lg). */
  padding?: number;
};

export function Card({
  title,
  subtitle,
  headerRight,
  children,
  style,
  flat,
  padding,
}: Props) {
  return (
    <View
      style={[
        styles.card,
        !flat && shadow.sm,
        { padding: padding ?? spacing.lg },
        style,
      ]}
    >
      {title || headerRight ? (
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {headerRight}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  title: { ...typography.h3, color: palette.ink },
  subtitle: {
    ...typography.small,
    color: palette.muted,
    marginTop: spacing.xxs,
  },
});
