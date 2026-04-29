import { useMutation } from '@apollo/client/react';
import {
  Button,
  GradientButton,
  ScreenContainer,
  ScreenHero,
  TextField,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ADMIN_LOGIN } from '../../lib/documents/auth';
import { storage } from '../../lib/storage';
import type { LoginResponse } from '../../lib/auth-types';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Login'>;

const BACK_OFFICE_ROLES = new Set(['CLUB_ADMIN', 'BOARD', 'TREASURER', 'COMM_MANAGER']);

export function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [login] = useMutation<{ login: LoginResponse }>(ADMIN_LOGIN);

  const onSubmit = async () => {
    if (!email || !password) {
      Alert.alert('Champs requis', 'Email et mot de passe sont obligatoires.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await login({
        variables: { email: email.trim(), password },
      });
      const data = res.data?.login;
      if (!data || !data.accessToken) {
        Alert.alert('Erreur', 'Identifiants invalides.');
        return;
      }
      const adminProfiles = (data.viewerProfiles ?? []).filter(
        (p) => p.membershipRole && BACK_OFFICE_ROLES.has(p.membershipRole),
      );

      if (adminProfiles.length === 0) {
        // Pas de back-office membership → check si l'user est SystemAdmin
        // (backend renvoie tous ses clubs même sans rôle back-office si SystemAdmin).
        if (data.viewerProfiles.length === 0) {
          Alert.alert(
            'Accès refusé',
            'Cet identifiant n\'a pas de droit d\'administration.',
          );
          return;
        }
        // SystemAdmin probable : laisser choisir le club.
        await storage.setToken(data.accessToken);
        navigation.replace('SelectClub', { profiles: data.viewerProfiles });
        return;
      }

      if (adminProfiles.length === 1) {
        const p = adminProfiles[0]!;
        await storage.setSession(data.accessToken, p.club.id);
        await storage.setActiveMemberId(p.memberId);
        navigation.replace('Main');
        return;
      }

      await storage.setToken(data.accessToken);
      navigation.replace('SelectClub', { profiles: adminProfiles });
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error ? err.message : 'Connexion impossible.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer scroll keyboardAvoiding>
      <ScreenHero
        eyebrow="ESPACE ADMIN"
        title="ClubFlow"
        subtitle="Gérez votre club en mobilité"
      />
      <View style={styles.form}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <TextField
          label="Mot de passe"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          textContentType="password"
        />
        <GradientButton
          label={submitting ? 'Connexion…' : 'Se connecter'}
          onPress={() => void onSubmit()}
          loading={submitting}
          disabled={submitting}
          iconRight="arrow-forward"
        />
        <Text style={styles.help}>
          Réservé aux dirigeants, trésoriers et responsables communication
          du club.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  form: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  help: {
    ...typography.small,
    color: palette.muted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
