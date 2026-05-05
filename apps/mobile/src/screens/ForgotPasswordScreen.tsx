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
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AnimatedPressable,
  GradientButton,
  TextField,
} from '../components/ui';
import { AuthClubBanner } from '../components/AuthClubBanner';
import { REQUEST_PASSWORD_RESET } from '../lib/documents';
import type { RequestPasswordResetData } from '../lib/auth-types';
import * as storage from '../lib/storage';
import {
  palette,
  radius,
  shadow,
  spacing,
  typography,
} from '../lib/theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

/**
 * Mot de passe oublié — étape 1 : saisie email, on envoie un lien
 * de reset par mail. Parité avec /forgot-password du portail web.
 *
 * Le serveur répond toujours `ok: true` (anti-énumération). On ne
 * révèle jamais si un email existe en DB.
 */
export function ForgotPasswordScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [request, { loading }] = useMutation<RequestPasswordResetData>(
    REQUEST_PASSWORD_RESET,
  );

  async function onSubmit() {
    setError(null);
    const e = email.trim().toLowerCase();
    if (!e) {
      setError('Adresse email requise.');
      return;
    }
    try {
      await request({ variables: { input: { email: e } } });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Demande impossible.',
      );
    }
  }

  async function changeClub() {
    await storage.clearSelectedClub();
    navigation.reset({ index: 0, routes: [{ name: 'SelectClub' }] });
  }

  if (done) {
    return (
      <View
        style={[
          styles.feedbackContainer,
          { paddingTop: insets.top + spacing.xxl },
        ]}
      >
        <View style={styles.feedbackIcon}>
          <Ionicons name="mail-unread" size={56} color="#1565c0" />
        </View>
        <Text style={styles.feedbackTitle}>Vérifiez votre e-mail</Text>
        <Text style={styles.feedbackLead}>
          Si <Text style={styles.strong}>{email.trim()}</Text> est
          enregistré, un lien de réinitialisation vous a été envoyé.
        </Text>
        <Text style={styles.feedbackMuted}>
          Cliquez sur le lien depuis votre téléphone pour définir un
          nouveau mot de passe. Le lien expire dans 1 heure.
        </Text>
        <GradientButton
          label="Retour à la connexion"
          icon="arrow-back-outline"
          onPress={() => navigation.navigate('Login')}
          fullWidth
          size="lg"
        />
      </View>
    );
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
          <AuthClubBanner onChangeClub={() => void changeClub()} />

          <View style={styles.card}>
            <Text style={styles.title}>Mot de passe oublié</Text>
            <Text style={styles.subtitle}>
              Saisissez votre adresse e-mail pour recevoir un lien de
              réinitialisation.
            </Text>

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
                error={error}
              />
              <GradientButton
                label="Envoyer le lien"
                icon="paper-plane-outline"
                onPress={() => void onSubmit()}
                loading={loading}
                disabled={!email.trim()}
                fullWidth
                size="lg"
              />
            </View>

            <AnimatedPressable
              onPress={() => navigation.navigate('Login')}
              accessibilityRole="button"
              accessibilityLabel="Retour à la connexion"
              style={styles.linkBtn}
            >
              <Ionicons
                name="arrow-back"
                size={16}
                color={palette.primary}
              />
              <Text style={styles.linkText}>Retour à la connexion</Text>
            </AnimatedPressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
  },
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
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  linkText: { ...typography.bodyStrong, color: palette.primary },

  feedbackContainer: {
    flex: 1,
    backgroundColor: palette.bg,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  feedbackIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackTitle: {
    ...typography.h1,
    color: palette.ink,
    textAlign: 'center',
  },
  feedbackLead: {
    ...typography.body,
    color: palette.body,
    textAlign: 'center',
  },
  feedbackMuted: {
    ...typography.small,
    color: palette.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  strong: { ...typography.bodyStrong, color: palette.ink },
});
