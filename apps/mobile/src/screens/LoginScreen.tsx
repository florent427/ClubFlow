import { useMutation } from '@apollo/client/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
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
import type { LoginWithProfilesData } from '../lib/auth-types';
import { LOGIN_WITH_PROFILES } from '../lib/documents';
import * as storage from '../lib/storage';
import {
  gradients as defaultGradients,
  palette,
  radius,
  shadow,
  spacing,
  typography,
} from '../lib/theme';
import { useClubTheme } from '../lib/theme-context';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const clubTheme = useClubTheme();
  const gradients = clubTheme.isClubBranded
    ? clubTheme.gradients
    : defaultGradients;
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
        await storage.setMemberSession(token, profiles[0].clubId);
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
    <View style={styles.flex}>
      {/* Hero gradient en haut, occupe ~45 % de l'écran */}
      <LinearGradient
        colors={gradients.hero.colors}
        start={gradients.hero.start}
        end={gradients.hero.end}
        style={[styles.hero, { paddingTop: insets.top + spacing.xxl }]}
      >
        {/* Cercles décoratifs en arrière-plan */}
        <View style={[styles.circle, styles.circle1]} />
        <View style={[styles.circle, styles.circle2]} />
        <View style={[styles.circle, styles.circle3]} />

        <View style={styles.brand}>
          <View style={styles.logoBubble}>
            <Ionicons name="shield-checkmark" size={28} color="#ffffff" />
          </View>
          <Text style={styles.brandName}>ClubFlow</Text>
          <Text style={styles.tagline}>Votre club, en mieux.</Text>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Card flottante qui chevauche le hero */}
          <View style={styles.cardWrap}>
            <View style={styles.card}>
              <Text style={styles.welcome}>Bonjour</Text>
              <Text style={styles.subtitle}>
                Connectez-vous à votre espace.
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
                <GradientButton
                  label="Se connecter"
                  icon="arrow-forward-circle"
                  onPress={() => void onSubmit()}
                  loading={loading}
                  disabled={!email.trim() || !password}
                  fullWidth
                  size="lg"
                  haptic
                />
              </View>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>ou</Text>
                <View style={styles.dividerLine} />
              </View>

              <AnimatedPressable
                onPress={() => navigation.navigate('Register')}
                accessibilityRole="button"
                accessibilityLabel="Créer un compte"
                style={styles.registerCta}
                haptic
              >
                <View style={styles.registerInner}>
                  <Ionicons
                    name="person-add-outline"
                    size={18}
                    color={palette.primary}
                  />
                  <Text style={styles.registerCtaText}>
                    Pas encore de compte ?{' '}
                    <Text style={styles.registerCtaTextBold}>S'inscrire</Text>
                  </Text>
                </View>
              </AnimatedPressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  hero: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.giant + spacing.xxl,
    minHeight: 320,
    overflow: 'hidden',
  },
  brand: { alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.xl },
  logoBubble: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    ...typography.displayLg,
    color: '#ffffff',
    marginTop: spacing.sm,
  },
  tagline: {
    ...typography.body,
    color: 'rgba(255, 255, 255, 0.85)',
  },

  // Cercles décoratifs en blanc translucide
  circle: { position: 'absolute', borderRadius: 1000 },
  circle1: {
    width: 240,
    height: 240,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -80,
    right: -60,
  },
  circle2: {
    width: 180,
    height: 180,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: 80,
    right: -120,
  },
  circle3: {
    width: 140,
    height: 140,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: -40,
    left: -40,
  },

  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    marginTop: -spacing.giant - spacing.lg, // chevauche le hero
  },
  cardWrap: { ...shadow.lg },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.xxl,
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  welcome: { ...typography.h1, color: palette.ink },
  subtitle: {
    ...typography.body,
    color: palette.muted,
    marginTop: -spacing.xs,
  },
  form: { gap: spacing.lg, marginTop: spacing.sm },

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.borderStrong,
  },
  dividerText: { ...typography.small, color: palette.muted },

  registerCta: {
    borderRadius: radius.md,
  },
  registerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  registerCtaText: { ...typography.body, color: palette.body },
  registerCtaTextBold: {
    ...typography.bodyStrong,
    color: palette.primary,
  },
});
