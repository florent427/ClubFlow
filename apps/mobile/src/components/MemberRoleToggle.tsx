import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { openAdminInBrowser } from '../lib/admin-switch';

type Props = {
  canAccessClubBackOffice: boolean;
  adminWorkspaceClubId?: string | null;
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
        accessibilityLabel="Ouvrir l’administration ClubFlow"
      >
        <Ionicons name="settings-outline" size={18} color="#1565c0" />
        <Text style={styles.headerBtnText}>Administration</Text>
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
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1565c0',
  },
  headerBtnText: {
    color: '#1565c0',
    fontWeight: '600',
    fontSize: 14,
  },
  pressed: { opacity: 0.7 },
  segment: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  segBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  segBtnOn: {
    backgroundColor: '#e3f2fd',
  },
  segBtnText: {
    fontSize: 14,
    color: '#333',
  },
  segBtnTextOn: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1565c0',
  },
});
