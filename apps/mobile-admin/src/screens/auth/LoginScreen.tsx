import { useApolloClient, useMutation } from '@apollo/client/react';
import {
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
import {
  ADMIN_LOGIN,
  VIEWER_ADMIN_SWITCH,
} from '../../lib/documents/auth';
import { storage } from '../../lib/storage';
import type { LoginResponse } from '../../lib/auth-types';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Login'>;

type AdminSwitchData = {
  viewerAdminSwitch: {
    canAccessClubBackOffice: boolean;
    adminWorkspaceClubId: string | null;
  };
};

export function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const client = useApolloClient();
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

      const profiles = data.viewerProfiles ?? [];
      if (profiles.length === 0) {
        Alert.alert(
          'Accès refusé',
          'Aucun profil club lié à ce compte. Contactez un administrateur.',
        );
        return;
      }

      // Si plusieurs profils dans des clubs différents → SelectClub.
      // Sinon, on prend le profil unique et on vérifie l'accès admin.
      const uniqueClubIds = Array.from(
        new Set(profiles.map((p) => p.clubId)),
      );

      if (uniqueClubIds.length > 1) {
        // Plusieurs clubs → laisse l'utilisateur choisir.
        await storage.setToken(data.accessToken);
        // Reset Apollo cache pour repartir propre côté nouveau club.
        await client.resetStore().catch(() => {});
        navigation.replace('SelectClub', { profiles });
        return;
      }

      // Un seul club → on tente directement.
      const p = profiles[0]!;
      await storage.setSession(data.accessToken, p.clubId);
      if (p.memberId) {
        await storage.setActiveMemberId(p.memberId);
      }
      await client.resetStore().catch(() => {});

      // Vérifie l'accès back-office côté API.
      try {
        const r = await client.query<AdminSwitchData>({
          query: VIEWER_ADMIN_SWITCH,
          fetchPolicy: 'network-only',
        });
        const switchInfo = r.data?.viewerAdminSwitch;
        if (!switchInfo?.canAccessClubBackOffice) {
          await storage.clearAuth();
          Alert.alert(
            'Accès refusé',
            'Ce compte n\'a pas les droits pour administrer ce club.\nL\'application admin est réservée aux dirigeants, trésoriers et responsables communication.',
          );
          return;
        }
        // Si l'API a un workspace par défaut différent (system admin), on bascule.
        if (
          switchInfo.adminWorkspaceClubId &&
          switchInfo.adminWorkspaceClubId !== p.clubId
        ) {
          await storage.setClubId(switchInfo.adminWorkspaceClubId);
          await client.resetStore().catch(() => {});
        }
      } catch (err) {
        await storage.clearAuth();
        Alert.alert(
          'Erreur',
          err instanceof Error ? err.message : 'Vérification d\'accès impossible.',
        );
        return;
      }

      navigation.replace('Main');
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
