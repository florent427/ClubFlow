import { useMutation } from '@apollo/client/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GradientButton,
  TextField,
} from '../components/ui';
import { RESET_PASSWORD } from '../lib/documents';
import type { ResetPasswordData } from '../lib/auth-types';
import * as storage from '../lib/storage';
import { palette, radius, shadow, spacing, typography } from '../lib/theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

/**
 * Reset password — étape 2 : ouvert via deep-link
 * `clubflow://reset-password?token=xxx`. Le user saisit son nouveau
 * mot de passe + confirmation, puis on appelle resetPassword qui
 * retourne accessToken + viewerProfiles. Login auto post-reset.
 */
export function ResetPasswordScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const token = route.params?.token ?? null;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [reset, { loading }] = useMutation<ResetPasswordData>(RESET_PASSWORD);

  async function onSubmit() {
    setError(null);
    if (!token) {
      setError('Lien de réinitialisation invalide.');
      return;
    }
    if (password.length < 8) {
      setError('Mot de passe trop court (minimum 8 caractères).');
      return;
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    try {
      const { data } = await reset({
        variables: { input: { token, newPassword: password } },
      });
      const payload = data?.resetPassword;
      const newTok = payload?.accessToken;
      const profiles = payload?.viewerProfiles ?? [];
      const contactClubId = payload?.contactClubId ?? null;
      if (!newTok) {
        setError('Réponse inattendue du serveur.');
        return;
      }
      // Login auto post-reset (même logique que LoginScreen)
      if (profiles.length === 0) {
        if (contactClubId) {
          await storage.setMemberContactSession(newTok, contactClubId);
          navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
          return;
        }
        setError('Aucun profil pour ce compte. Contactez votre club.');
        return;
      }
      await storage.setToken(newTok);
      if (profiles.length === 1) {
        await storage.setMemberSession(newTok, profiles[0].clubId);
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        return;
      }
      await storage.clearClubId();
      navigation.reset({ index: 0, routes: [{ name: 'SelectProfile' }] });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Réinitialisation impossible. Le lien est peut-être expiré.',
      );
    }
  }

  return (
    <View style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: insets.top + spacing.xxl,
              paddingBottom: insets.bottom + spacing.xl,
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.title}>Nouveau mot de passe</Text>
            <Text style={styles.subtitle}>
              Choisissez un nouveau mot de passe (8 caractères minimum).
            </Text>

            <View style={styles.form}>
              <TextField
                label="Nouveau mot de passe"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
              />
              <TextField
                label="Confirmer"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                error={error}
              />
              <GradientButton
                label="Réinitialiser et se connecter"
                icon="checkmark-circle-outline"
                onPress={() => void onSubmit()}
                loading={loading}
                disabled={!password || !confirm}
                fullWidth
                size="lg"
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.xxl,
    padding: spacing.xxl,
    gap: spacing.lg,
    ...shadow.md,
  },
  title: { ...typography.h1, color: palette.ink },
  subtitle: {
    ...typography.body,
    color: palette.muted,
    marginTop: -spacing.xs,
  },
  form: { gap: spacing.lg, marginTop: spacing.sm },
});
