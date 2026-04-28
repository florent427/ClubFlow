import { useMutation } from '@apollo/client/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, TextField } from '../components/ui';
import type { LoginWithProfilesData } from '../lib/auth-types';
import { LOGIN_WITH_PROFILES } from '../lib/documents';
import * as storage from '../lib/storage';
import { palette, spacing, typography } from '../lib/theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [login, { loading }] = useMutation<LoginWithProfilesData>(
    LOGIN_WITH_PROFILES,
  );

  async function onSubmit() {
    setError(null);
    try {
      const { data } = await login({
        variables: { input: { email: email.trim(), password } },
      });
      const payload = data?.login;
      const token = payload?.accessToken;
      const profiles = payload?.viewerProfiles ?? [];
      const contactClubId = payload?.contactClubId ?? null;
      if (!token) {
        setError('Réponse inattendue du serveur.');
        return;
      }
      if (profiles.length === 0) {
        if (contactClubId) {
          await storage.setMemberContactSession(token, contactClubId);
          navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
          return;
        }
        setError(
          'Aucun profil membre ni espace contact pour ce compte. Contactez votre club.',
        );
        return;
      }
      await storage.setToken(token);
      if (profiles.length === 1) {
        const p = profiles[0];
        await storage.setMemberSession(token, p.clubId);
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        return;
      }
      await storage.clearClubId();
      navigation.reset({ index: 0, routes: [{ name: 'SelectProfile' }] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connexion impossible.';
      setError(msg);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + spacing.huge },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <View style={styles.logoBubble}>
            <Ionicons name="shield-checkmark" size={32} color="white" />
          </View>
          <Text style={styles.eyebrow}>CLUBFLOW</Text>
          <Text style={styles.title}>Bienvenue</Text>
          <Text style={styles.lead}>
            Connectez-vous à votre espace membre.
          </Text>
        </View>

        <View style={styles.form}>
          <TextField
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            placeholder="vous@exemple.fr"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
          />
          <TextField
            label="Mot de passe"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            error={error}
          />
          <Button
            label="Se connecter"
            onPress={() => void onSubmit()}
            loading={loading}
            disabled={!email.trim() || !password}
            fullWidth
            size="lg"
            icon="log-in-outline"
          />
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>ou</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          style={styles.registerCta}
          onPress={() => navigation.navigate('Register')}
          accessibilityRole="button"
          accessibilityLabel="Créer un compte ClubFlow"
        >
          <Ionicons
            name="person-add-outline"
            size={18}
            color={palette.primary}
          />
          <Text style={styles.registerCtaText}>Créer un compte</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  container: {
    flexGrow: 1,
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.huge,
    gap: spacing.xxl,
  },
  brand: { alignItems: 'center', gap: spacing.sm },
  logoBubble: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  eyebrow: { ...typography.eyebrow, color: palette.primary },
  title: { ...typography.displayLg, color: palette.ink, textAlign: 'center' },
  lead: {
    ...typography.body,
    color: palette.muted,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  form: { gap: spacing.lg },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.borderStrong,
  },
  dividerText: { ...typography.small, color: palette.muted },
  registerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  registerCtaText: {
    ...typography.bodyStrong,
    color: palette.primary,
  },
});
