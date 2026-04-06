import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MemberProfileSwitcher } from '../components/MemberProfileSwitcher';
import * as storage from '../lib/storage';
import type { RootStackParamList } from '../types/navigation';

export function SettingsScreen() {
  const navigation = useNavigation();
  const rootNav =
    navigation.getParent<NativeStackNavigationProp<RootStackParamList>>() ??
    navigation;

  async function logout() {
    await storage.clearAuth();
    rootNav.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }),
    );
  }

  async function chooseOtherProfile() {
    await storage.clearClubId();
    rootNav.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: 'SelectProfile' }] }),
    );
  }

  return (
    <View style={styles.page}>
      <Text style={styles.title}>Paramètres</Text>
      <Text style={styles.lead}>
        Gérez votre session et le changement de profil depuis cette page.
      </Text>

      <MemberProfileSwitcher />

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.btnSecondary, pressed && styles.pressed]}
          onPress={() => void chooseOtherProfile()}
        >
          <Text style={styles.btnSecondaryText}>Choisir un autre profil</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.btnDanger, pressed && styles.pressed]}
          onPress={() => void logout()}
        >
          <Text style={styles.btnDangerText}>Se déconnecter</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8, color: '#111' },
  lead: { fontSize: 16, color: '#444', lineHeight: 24, marginBottom: 16 },
  actions: { gap: 12, marginTop: 8 },
  btnSecondary: {
    backgroundColor: '#eceff1',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnSecondaryText: { fontSize: 16, fontWeight: '600', color: '#263238' },
  btnDanger: {
    backgroundColor: '#c62828',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnDangerText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  pressed: { opacity: 0.85 },
});
