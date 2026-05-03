import { useMutation } from '@apollo/client/react';
import { CommonActions, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { GradientButton } from '../components/ui';
import { VERIFY_EMAIL } from '../lib/documents';
import {
  gradients,
  palette,
  shadow,
  spacing,
  typography,
} from '../lib/theme';
import type { VerifyEmailData } from '../lib/auth-types';
import {
  clearAuth,
  hasMemberSession,
  setMemberContactSession,
  setMemberSession,
  setToken,
} from '../lib/storage';
import type { RootStackParamList } from '../types/navigation';

type Phase = 'preparing' | 'verifying' | 'success' | 'error';

/**
 * Écran cible du deep link `clubflow://verify-email?token=...`. Consomme
 * le token côté backend, hydrate la session, puis redirige vers le
 * sélecteur de profil ou l'accueil.
 */
export function VerifyEmailScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<NativeStackScreenProps<RootStackParamList, 'VerifyEmail'>['route']>();
  const token = route.params?.token ?? '';

  const [phase, setPhase] = useState<Phase>('preparing');
  const [error, setError] = useState<string | null>(null);
  const verifyAttempted = useRef(false);

  const [runVerify] = useMutation<VerifyEmailData>(VERIFY_EMAIL);

  useEffect(() => {
    if (!token.trim()) {
      setError('Lien incomplet (token manquant).');
      setPhase('error');
      return;
    }
    if (verifyAttempted.current) return;
    verifyAttempted.current = true;

    void (async () => {
      // Si une session est active (parent qui clique le lien d'activation
      // de son enfant sur le même téléphone), on déconnecte d'abord pour
      // pouvoir basculer sur le nouveau profil.
      if (await hasMemberSession()) {
        await clearAuth();
      }
      setPhase('verifying');
      try {
        const { data } = await runVerify({
          variables: { input: { token: token.trim() } },
        });
        const payload = data?.verifyEmail;
        if (!payload?.accessToken) {
          setError('Réponse serveur inattendue.');
          setPhase('error');
          return;
        }
        const profiles = payload.viewerProfiles ?? [];
        const cClub = payload.contactClubId ?? null;
        if (profiles.length === 0 && cClub) {
          await setMemberContactSession(payload.accessToken, cClub);
          setPhase('success');
          setTimeout(() => {
            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: 'Main' }],
              }),
            );
          }, 800);
        } else if (profiles.length === 1) {
          await setMemberSession(payload.accessToken, profiles[0].clubId);
          setPhase('success');
          setTimeout(() => {
            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: 'Main' }],
              }),
            );
          }, 800);
        } else if (profiles.length > 1) {
          await setToken(payload.accessToken);
          setPhase('success');
          setTimeout(() => {
            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: 'SelectProfile' }],
              }),
            );
          }, 800);
        } else {
          setError(
            'Compte vérifié, mais aucun profil rattaché à votre adresse e-mail. Contactez votre club pour qu\'il vous ajoute.',
          );
          setPhase('error');
        }
      } catch (e: unknown) {
        setError(
          e instanceof Error ? e.message : 'Lien invalide ou expiré.',
        );
        setPhase('error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const subText =
    phase === 'verifying'
      ? 'Validation du lien en cours…'
      : phase === 'success'
        ? 'Compte vérifié — redirection…'
        : phase === 'error'
          ? error
          : 'Préparation…';
  const icon =
    phase === 'success'
      ? 'checkmark-circle'
      : phase === 'error'
        ? 'alert-circle'
        : 'mail-open';

  return (
    <View style={styles.center}>
      {phase === 'error' ? (
        <View style={[styles.iconBubble, styles.iconError]}>
          <Ionicons name={icon} size={56} color={palette.danger} />
        </View>
      ) : phase === 'success' ? (
        <View style={[styles.iconBubble, styles.iconSuccess]}>
          <Ionicons name={icon} size={56} color={palette.success} />
        </View>
      ) : (
        <LinearGradient
          colors={gradients.hero.colors}
          start={gradients.hero.start}
          end={gradients.hero.end}
          style={[styles.iconBubble, shadow.glowPrimary]}
        >
          <Ionicons name={icon} size={56} color="#ffffff" />
        </LinearGradient>
      )}
      <Text style={styles.title}>Confirmation</Text>
      <Text style={styles.lead}>{subText}</Text>
      {phase === 'error' ? (
        <GradientButton
          label="Retour à la connexion"
          icon="arrow-back-outline"
          onPress={() => navigation.navigate('Login')}
          fullWidth
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  iconBubble: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSuccess: { backgroundColor: palette.successBg },
  iconError: { backgroundColor: palette.dangerBg },
  title: {
    ...typography.h1,
    color: palette.ink,
    marginTop: spacing.md,
  },
  lead: {
    ...typography.body,
    color: palette.body,
    textAlign: 'center',
  },
});
