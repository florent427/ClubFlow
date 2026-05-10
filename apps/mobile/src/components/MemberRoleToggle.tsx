import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as storage from '../lib/storage';
import { palette, radius, spacing, typography } from '../lib/theme';
import type { RootStackParamList } from '../types/navigation';

type Props = {
  canAccessClubBackOffice: boolean;
  /** Club de l'admin (depuis viewerAdminSwitch.adminWorkspaceClubId). */
  adminWorkspaceClubId?: string | null;
  /** `header` = bouton compact dans un header (versions onDark via hero
   * gradient adaptent les couleurs). */
  variant?: 'header' | 'segment';
};

/**
 * Bouton "Admin" qui ouvre l'écran AdminWebViewScreen (WebView de
 * l'admin web staging/prod avec SSO automatique). Visible uniquement
 * si le user a `canAccessClubBackOffice` ET que le club admin matche
 * le club courant (sinon afficher un bouton "Admin du club X" sur un
 * autre club serait confus dans le contexte actuel).
 */
export function MemberRoleToggle({
  canAccessClubBackOffice,
  adminWorkspaceClubId,
  variant = 'segment',
}: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  if (canAccessClubBackOffice !== true) {
    return null;
  }

  async function goAdmin() {
    // Vérif basique : on a bien une session valide pour SSO. Si l'user
    // a switch de club récent, le clubId actuel doit matcher
    // adminWorkspaceClubId (sinon admin d'un autre club, pas pertinent ici).
    const club = await storage.getSelectedClub();
    if (
      adminWorkspaceClubId &&
      club &&
      adminWorkspaceClubId !== club.id
    ) {
      // Pas admin du club courant → on n'ouvre pas (le bouton ne devrait
      // pas être visible en théorie, mais defense-in-depth).
      return;
    }
    navigation.navigate('Admin');
  }

  if (variant === 'header') {
    return (
      <Pressable
        style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
        onPress={() => void goAdmin()}
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
        onPress={() => void goAdmin()}
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
