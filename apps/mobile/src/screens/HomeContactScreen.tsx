import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as storage from '../lib/storage';
import type { RootStackParamList } from '../types/navigation';

/**
 * Parité avec le portail web — espace contact (onboarding).
 */
export function HomeContactScreen() {
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
    <ScrollView style={styles.page} contentContainerStyle={styles.pageInner}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Bienvenue</Text>
        <Text style={styles.title}>Votre espace contact</Text>
        <Text style={styles.lead}>
          Votre compte est actif et vérifié. Voici ce que vous pouvez faire dès
          maintenant.
        </Text>
      </View>

      <View style={styles.cardOk}>
        <Ionicons name="checkmark-circle" size={28} color="#2e7d32" />
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>Consulter les factures</Text>
          <Text style={styles.hint}>
            Accédez à l&apos;onglet « Famille » pour voir les factures liées à
            votre espace familial.
          </Text>
        </View>
      </View>

      <View style={styles.cardOk}>
        <Ionicons name="people" size={28} color="#2e7d32" />
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>Gérer les profils de vos enfants</Text>
          <Text style={styles.hint}>
            Si le club a rattaché vos enfants à votre compte, vous pouvez
            basculer entre leurs profils depuis les paramètres.
          </Text>
        </View>
      </View>

      <View style={styles.cardWait}>
        <Ionicons name="hourglass-outline" size={28} color="#f57c00" />
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>Espace membre complet</Text>
          <Text style={styles.hint}>
            Le planning, la progression et les réservations seront disponibles
            lorsque le club aura créé votre fiche sportive. Contactez le
            secrétariat si nécessaire.
          </Text>
        </View>
      </View>

      <View style={styles.session}>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  pageInner: { padding: 16, paddingBottom: 32 },
  hero: { marginBottom: 20 },
  eyebrow: {
    fontSize: 12,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8, color: '#111' },
  lead: { fontSize: 16, color: '#444', lineHeight: 24 },
  cardOk: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    backgroundColor: '#f1f8e9',
    marginBottom: 12,
  },
  cardWait: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffe0b2',
    backgroundColor: '#fff8e1',
    marginBottom: 12,
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4, color: '#111' },
  hint: { fontSize: 14, color: '#555', lineHeight: 20 },
  session: { marginTop: 24, gap: 12 },
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
