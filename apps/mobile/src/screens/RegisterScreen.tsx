import { useMutation } from '@apollo/client/react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
import { Button, TextField } from '../components/ui';
import { REGISTER_CONTACT } from '../lib/documents';
import { palette, spacing, typography } from '../lib/theme';
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
  const [alreadyExists, setAlreadyExists] = useState(false);

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
      await register({
        variables: {
          input: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: e,
            password,
          },
        },
      });
      setDone(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('USER_ALREADY_EXISTS')) {
        setAlreadyExists(true);
        return;
      }
      setError(err instanceof Error ? err.message : 'Inscription impossible.');
    }
  }

  if (done) {
    return (
      <View style={styles.flexCenter}>
        <View style={styles.successIcon}>
          <Ionicons name="mail-unread" size={48} color={palette.primary} />
        </View>
        <Text style={styles.title}>Vérifiez votre e-mail</Text>
        <Text style={styles.lead}>
          Un lien de confirmation a été envoyé à{'\n'}
          <Text style={styles.strong}>{email.trim()}</Text>.
        </Text>
        <Text style={styles.muted}>
          Cliquez dessus depuis votre téléphone — le lien ouvrira l'app
          ClubFlow directement (deep link).
        </Text>
        <Button
          label="Retour à la connexion"
          onPress={() => navigation.navigate('Login')}
          variant="ghost"
          fullWidth
          icon="arrow-back-outline"
        />
      </View>
    );
  }

  if (alreadyExists) {
    return (
      <View style={styles.flexCenter}>
        <View style={[styles.successIcon, styles.warningIcon]}>
          <Ionicons name="alert-circle" size={48} color={palette.warning} />
        </View>
        <Text style={styles.title}>Compte déjà existant</Text>
        <Text style={styles.lead}>
          Un compte existe déjà pour{' '}
          <Text style={styles.strong}>{email.trim()}</Text>.
        </Text>
        <Button
          label="Se connecter"
          onPress={() => navigation.navigate('Login')}
          fullWidth
          icon="log-in-outline"
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <Text style={styles.eyebrow}>CLUBFLOW</Text>
          <Text style={styles.title}>Créer un compte</Text>
          <Text style={styles.lead}>
            Inscription rapide en tant que contact du club. Vous pourrez
            compléter votre dossier plus tard.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.row}>
            <TextField
              label="Prénom"
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              autoComplete="given-name"
              containerStyle={styles.flex}
            />
            <TextField
              label="Nom"
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              autoComplete="family-name"
              containerStyle={styles.flex}
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

          <Button
            label="S'inscrire"
            onPress={() => void onSubmit()}
            loading={loading}
            fullWidth
            size="lg"
            icon="checkmark-circle-outline"
          />
          <Button
            label="Déjà un compte ? Connexion"
            onPress={() => navigation.navigate('Login')}
            variant="ghost"
            fullWidth
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  flexCenter: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.huge,
    gap: spacing.xxl,
  },
  brand: { gap: spacing.sm, alignItems: 'center' },
  eyebrow: { ...typography.eyebrow, color: palette.primary },
  title: {
    ...typography.displayLg,
    color: palette.ink,
    textAlign: 'center',
  },
  lead: {
    ...typography.body,
    color: palette.muted,
    textAlign: 'center',
  },
  muted: {
    ...typography.small,
    color: palette.mutedSoft,
    textAlign: 'center',
  },
  strong: { fontWeight: '700', color: palette.ink },
  form: { gap: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.md },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningIcon: { backgroundColor: palette.warningBg },
});
