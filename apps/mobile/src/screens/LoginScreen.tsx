import { useMutation } from '@apollo/client/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  ActivityIndicator,
  Button,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { LoginWithProfilesData } from '../lib/auth-types';
import { LOGIN_WITH_PROFILES } from '../lib/documents';
import * as storage from '../lib/storage';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
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
      const msg =
        err instanceof Error ? err.message : 'Connexion impossible.';
      setError(msg);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ClubFlow</Text>
      <Text style={styles.subtitle}>Connexion</Text>
      <TextInput
        style={styles.input}
        placeholder="E-mail"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Mot de passe"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator />
      ) : (
        <Button title="Se connecter" onPress={() => void onSubmit()} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 16,
  },
  error: {
    color: '#b00020',
    marginBottom: 12,
  },
});
