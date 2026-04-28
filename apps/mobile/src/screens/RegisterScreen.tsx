import { useMutation } from '@apollo/client/react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { REGISTER_CONTACT } from '../lib/documents';
import type { RegisterContactData } from '../lib/auth-types';
import type { RootStackParamList } from '../types/navigation';

/**
 * Inscription d'un nouveau contact (parent / responsable). Ne crée pas
 * de fiche membre directement : un email de vérification est envoyé,
 * le compte est actif après clic sur le lien (cf VerifyEmailScreen).
 */
export function RegisterScreen() {
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
      <View style={styles.center}>
        <Ionicons name="mail-unread" size={64} color="#1565c0" />
        <Text style={styles.title}>Vérifiez votre e-mail</Text>
        <Text style={styles.lead}>
          Un lien de confirmation a été envoyé à{'\n'}
          <Text style={styles.strong}>{email.trim()}</Text>.{'\n'}
          Cliquez dessus pour activer votre compte.
        </Text>
        <Text style={styles.muted}>
          Sur mobile, le lien ouvre l'application directement (deep link
          clubflow://). Sinon vous pouvez aussi le coller dans Safari /
          Chrome.
        </Text>
        <Pressable
          style={styles.btnGhost}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.btnGhostText}>Retour à la connexion</Text>
        </Pressable>
      </View>
    );
  }

  if (alreadyExists) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={64} color="#f59e0b" />
        <Text style={styles.title}>Compte déjà existant</Text>
        <Text style={styles.lead}>
          Un compte existe déjà pour{' '}
          <Text style={styles.strong}>{email.trim()}</Text>.{'\n'}
          Connectez-vous, ou réinitialisez votre mot de passe si nécessaire.
        </Text>
        <Pressable
          style={styles.btnPrimary}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.btnPrimaryText}>Se connecter</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>CLUBFLOW</Text>
          <Text style={styles.title}>Créer un compte</Text>
          <Text style={styles.lead}>
            Inscription rapide en tant que contact du club. Vous pourrez
            compléter votre dossier plus tard.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Prénom</Text>
          <TextInput
            style={styles.input}
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            autoComplete="given-name"
          />

          <Text style={styles.label}>Nom</Text>
          <TextInput
            style={styles.input}
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
            autoComplete="family-name"
          />

          <Text style={styles.label}>E-mail</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            autoCorrect={false}
          />

          <Text style={styles.label}>Mot de passe (8 caractères min.)</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.btnPrimary, loading && styles.btnDisabled]}
            disabled={loading}
            onPress={() => void onSubmit()}
          >
            <Text style={styles.btnPrimaryText}>
              {loading ? 'Envoi…' : "S'inscrire"}
            </Text>
          </Pressable>
          <Pressable
            style={styles.btnGhost}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.btnGhostText}>Déjà un compte ? Connexion</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8fafc' },
  center: {
    flex: 1,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  scroll: { padding: 24, gap: 16, paddingBottom: 48 },
  header: { gap: 8, marginBottom: 8 },
  eyebrow: {
    fontSize: 12,
    color: '#1565c0',
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  lead: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 21,
    textAlign: 'center',
  },
  muted: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 17,
  },
  strong: { fontWeight: '700', color: '#0f172a' },
  form: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569' },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  error: { color: '#dc2626', fontSize: 13 },
  btnPrimary: {
    backgroundColor: '#1565c0',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  btnPrimaryText: { color: 'white', fontWeight: '700', fontSize: 15 },
  btnGhost: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnGhostText: { color: '#1565c0', fontWeight: '600', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
});
