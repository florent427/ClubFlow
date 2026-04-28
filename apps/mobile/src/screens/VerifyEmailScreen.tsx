import { useMutation } from '@apollo/client/react';
import { CommonActions, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { VERIFY_EMAIL } from '../lib/documents';
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
        ? 'alert-circle-outline'
        : 'mail-open-outline';
  const iconColor =
    phase === 'success' ? '#16a34a' : phase === 'error' ? '#dc2626' : '#1565c0';

  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={64} color={iconColor} />
      <Text style={styles.title}>Confirmation</Text>
      <Text style={styles.lead}>{subText}</Text>
      {phase === 'error' ? (
        <Pressable
          style={styles.btnPrimary}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.btnPrimaryText}>Retour à la connexion</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  lead: {
    fontSize: 15,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 21,
  },
  btnPrimary: {
    backgroundColor: '#1565c0',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 8,
  },
  btnPrimaryText: { color: 'white', fontWeight: '700', fontSize: 15 },
});
