import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { palette, spacing, typography } from '../../lib/theme';

type Props = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: 'soft' | 'card';
};

/**
 * État vide standardisé : icône grisée + titre + description + CTA optionnel.
 * Utilisé partout où il n'y a rien à afficher (planning vide, factures
 * vides, salons sans messages, etc.).
 */
export function EmptyState({
  icon = 'help-circle-outline',
  title,
  description,
  action,
  variant = 'soft',
}: Props) {
  return (
    <View
      style={[styles.box, variant === 'card' ? styles.boxCard : styles.boxSoft]}
    >
      <Ionicons name={icon} size={36} color={palette.mutedSoft} />
      <Text style={styles.title}>{title}</Text>
      {description ? (
        <Text style={styles.description}>{description}</Text>
      ) : null}
      {action ? <View style={{ marginTop: spacing.sm }}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  boxSoft: {},
  boxCard: {
    backgroundColor: palette.bgAlt,
    borderRadius: 12,
  },
  title: {
    ...typography.bodyStrong,
    color: palette.inkSoft,
    textAlign: 'center',
  },
  description: {
    ...typography.small,
    color: palette.muted,
    textAlign: 'center',
  },
});
