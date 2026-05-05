import { useMutation } from '@apollo/client/react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
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
  Button,
  GradientButton,
  TextField,
} from '../components/ui';
import { REGISTER_CONTACT } from '../lib/documents';
import * as storage from '../lib/storage';
import {
  gradients,
  palette,
  radius,
  shadow,
  spacing,
  typography,
} from '../lib/theme';
import type { RegisterContactData } from '../lib/auth-types';
import type { RootStackParamList } from '../types/navigation';

export function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Cas multi-tenant : User déjà vérifié ailleurs, Contact créé direct
  // sans email. Affiche un autre écran "Inscription terminée → Login".
  const [doneSkipMail, setDoneSkipMail] = useState(false);
  const [alreadyExists, setAlreadyExists] = useState(false);

  // Multi-tenant : on récupère le club choisi sur SelectClubScreen pour
  // le passer explicitement à `registerContact` (sinon backend tombe
  // sur `CLUB_ID` env = SKSR par défaut, indépendamment du selectedClub).
  const [selectedClubSlug, setSelectedClubSlug] = useState<string | null>(
    null,
  );
  useEffect(() => {
    void (async () => {
      const sel = await storage.getSelectedClub();
      setSelectedClubSlug(sel?.slug ?? null);
    })();
  }, []);

  const [register, { loading }] = useMutation<RegisterContactData>(
    REGISTER_CONTACT,
  );

  async function onSubmit() {
    setError(null);
    setAlreadyExists(false);
    const e = email.trim().toLowerCase();
    if (!firstName.trim() || !lastName.trim() || !e || password.length < 8) {
      setError(
        'Tous les champs sont requis. Le mot de passe doit faire au moins 8 caractères.',
      );
      return;
    }
    try {
      const { data } = await register({
        variables: {
          input: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: e,
            password,
            // Sans clubSlug le backend tombe sur CLUB_ID env (compat
            // mono-tenant SKSR). Avec, on bind explicitement.
            clubSlug: selectedClubSlug ?? undefined,
          },
        },
      });
      if (data?.registerContact.requiresEmailVerification === false) {
        setDoneSkipMail(true);
      } else {
        setDone(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('USER_ALREADY_EXISTS')) {
        setAlreadyExists(true);
        return;
      }
      setError(err instanceof Error ? err.message : 'Inscription impossible.');
    }
  }

  if (doneSkipMail) {
    return (
      <View style={styles.feedbackContainer}>
        <LinearGradient
          colors={gradients.hero.colors}
          start={gradients.hero.start}
          end={gradients.hero.end}
          style={styles.feedbackIcon}
        >
          <Ionicons name="checkmark-circle" size={56} color="#ffffff" />
        </LinearGradient>
        <Text style={styles.feedbackTitle}>Inscription terminée</Text>
        <Text style={styles.feedbackLead}>
          Votre compte <Text style={styles.strong}>{email.trim()}</Text>{'\n'}
          est déjà vérifié — connectez-vous pour accéder à votre espace.
        </Text>
        <GradientButton
          label="Se connecter"
          icon="log-in-outline"
          onPress={() => navigation.navigate('Login')}
          fullWidth
          size="lg"
        />
      </View>
    );
  }

  if (done) {
    return (
      <View style={styles.feedbackContainer}>
        <LinearGradient
          colors={gradients.hero.colors}
          start={gradients.hero.start}
          end={gradients.hero.end}
          style={styles.feedbackIcon}
        >
          <Ionicons name="mail-unread" size={56} color="#ffffff" />
        </LinearGradient>
        <Text style={styles.feedbackTitle}>Vérifiez votre e-mail</Text>
        <Text style={styles.feedbackLead}>
          Un lien de confirmation a été envoyé à{'\n'}
          <Text style={styles.strong}>{email.trim()}</Text>.
        </Text>
        <Text style={styles.feedbackMuted}>
          Cliquez sur le lien depuis votre téléphone — il ouvrira l'app
          ClubFlow directement.
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

  if (alreadyExists) {
    return (
      <View style={styles.feedbackContainer}>
        <View style={[styles.feedbackIcon, styles.warningIcon]}>
          <Ionicons name="alert-circle" size={56} color={palette.warning} />
        </View>
        <Text style={styles.feedbackTitle}>Compte déjà existant</Text>
        <Text style={styles.feedbackLead}>
          Un compte existe déjà pour{' '}
          <Text style={styles.strong}>{email.trim()}</Text>.
        </Text>
        <GradientButton
          label="Se connecter"
          icon="log-in-outline"
          onPress={() => navigation.navigate('Login')}
          fullWidth
          size="lg"
        />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <LinearGradient
        colors={gradients.hero.colors}
        start={gradients.hero.start}
        end={gradients.hero.end}
        style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}
      >
        <View style={[styles.circle, styles.circle1]} />
        <View style={[styles.circle, styles.circle2]} />

        <AnimatedPressable
          onPress={() => navigation.navigate('Login')}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </AnimatedPressable>

        <View style={styles.brand}>
          <Text style={styles.eyebrow}>CRÉER UN COMPTE</Text>
          <Text style={styles.title}>Bienvenue</Text>
          <Text style={styles.lead}>
            Inscription rapide en tant que contact du club.
          </Text>
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
          <View style={styles.cardWrap}>
            <View style={styles.card}>
              <View style={styles.row}>
                <TextField
                  label="Prénom"
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                  autoComplete="given-name"
                  containerStyle={{ flex: 1 }}
                />
                <TextField
                  label="Nom"
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                  autoComplete="family-name"
                  containerStyle={{ flex: 1 }}
                />
              </View>

              <TextField
                label="E-mail"
                value={email}
                onChangeText={setEmail}
                placeholder="vous@exemple.fr"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                autoCorrect={false}
              />

              <TextField
                label="Mot de passe"
                hint="8 caractères minimum"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                error={error}
              />

              <GradientButton
                label="S'inscrire"
                icon="checkmark-circle-outline"
                onPress={() => void onSubmit()}
                loading={loading}
                fullWidth
                size="lg"
              />
              <Button
                label="Déjà un compte ? Connexion"
                onPress={() => navigation.navigate('Login')}
                variant="ghost"
                fullWidth
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

  hero: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.giant,
    minHeight: 240,
    overflow: 'hidden',
  },
  circle: { position: 'absolute', borderRadius: 1000 },
  circle1: {
    width: 200,
    height: 200,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -50,
    right: -50,
  },
  circle2: {
    width: 140,
    height: 140,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: 60,
    left: -60,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { marginTop: spacing.xl, gap: spacing.xs },
  eyebrow: {
    ...typography.eyebrow,
    color: 'rgba(255,255,255,0.85)',
  },
  title: {
    ...typography.displayLg,
    color: '#ffffff',
    marginTop: spacing.sm,
  },
  lead: {
    ...typography.body,
    color: 'rgba(255,255,255,0.85)',
  },

  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    marginTop: -spacing.xxxl,
  },
  cardWrap: { ...shadow.lg },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.xxl,
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  row: { flexDirection: 'row', gap: spacing.md },

  feedbackContainer: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  feedbackIcon: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.glowPrimary,
  },
  warningIcon: {
    backgroundColor: palette.warningBg,
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
  },
  strong: {
    fontFamily: typography.bodyStrong.fontFamily,
    color: palette.ink,
  },
});
