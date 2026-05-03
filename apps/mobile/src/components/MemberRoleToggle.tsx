import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { openAdminInBrowser } from '../lib/admin-switch';
import { palette, radius, spacing, typography } from '../lib/theme';

type Props = {
  canAccessClubBackOffice: boolean;
  adminWorkspaceClubId?: string | null;
  /** `header` = bouton compact dans un header (versions onDark via hero
   * gradient adaptent les couleurs). */
  variant?: 'header' | 'segment';
};

export function MemberRoleToggle({
  canAccessClubBackOffice,
  variant = 'segment',
}: Props) {
  if (canAccessClubBackOffice !== true) {
    return null;
  }

  if (variant === 'header') {
    return (
      <Pressable
        style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
        onPress={() => openAdminInBrowser()}
        accessibilityRole="button"
        accessibilityLabel="Ouvrir l'administration ClubFlow"
      >
        <Ionicons name="settings-outline" size={16} color="#ffffff" />
        <Text style={styles.headerBtnText}>Admin</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.segment}>
      <Pressable
        style={({ pressed }) => [styles.segBtn, pressed && styles.pressed]}
        onPress={() => openAdminInBrowser()}
      >
        <Text style={styles.segBtnText}>Administration</Text>
      </Pressable>
      <View style={[styles.segBtn, styles.segBtnOn]}>
        <Text style={styles.segBtnTextOn}>Personnel</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    minHeight: 36,
  },
  headerBtnText: {
    ...typography.smallStrong,
    color: '#ffffff',
  },
  pressed: { opacity: 0.7 },
  segment: {
    flexDirection: 'row',
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.borderStrong,
  },
  segBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: palette.surface,
  },
  segBtnOn: {
    backgroundColor: palette.primaryLight,
  },
  segBtnText: {
    ...typography.smallStrong,
    color: palette.body,
  },
  segBtnTextOn: {
    ...typography.smallStrong,
    color: palette.primary,
  },
});
