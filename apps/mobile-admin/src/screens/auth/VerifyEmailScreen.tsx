import { useMutation } from '@apollo/client/react';
import {
  Button,
  ScreenContainer,
  ScreenHero,
  palette,
  spacing,
  typography,
  VERIFY_EMAIL,
} from '@clubflow/mobile-shared';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'VerifyEmail'>;
type R = RouteProp<RootStackParamList, 'VerifyEmail'>;

export function VerifyEmailScreen() {
  const navigation = useNavigation<Nav>();
  const { token } = useRoute<R>().params ?? {};
  const [verify] = useMutation(VERIFY_EMAIL);
  const [state, setState] = useState<'verifying' | 'ok' | 'error'>(
    token ? 'verifying' : 'error',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState('error');
      setErrorMessage('Lien invalide.');
      return;
    }
    void verify({ variables: { token } })
      .then(() => setState('ok'))
      .catch((err) => {
        setState('error');
        setErrorMessage(
          err instanceof Error ? err.message : 'Erreur inconnue.',
        );
      });
  }, [token, verify]);

  return (
    <ScreenContainer>
      <ScreenHero
        eyebrow="VÉRIFICATION"
        title="Confirmation de l'email"
        compact
      />
      <View style={styles.center}>
        {state === 'verifying' ? (
          <>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.msg}>Vérification en cours…</Text>
          </>
        ) : state === 'ok' ? (
          <>
            <Text style={styles.msgOk}>Email vérifié avec succès.</Text>
            <Button
              label="Se connecter"
              variant="primary"
              onPress={() => navigation.replace('Login')}
            />
          </>
        ) : (
          <>
            <Text style={styles.msgErr}>
              {errorMessage ?? 'Lien expiré ou invalide.'}
            </Text>
            <Button
              label="Retour"
              variant="ghost"
              onPress={() => navigation.replace('Login')}
            />
          </>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  msg: { ...typography.body, color: palette.body },
  msgOk: { ...typography.bodyStrong, color: palette.successText, textAlign: 'center' },
  msgErr: { ...typography.bodyStrong, color: palette.dangerText, textAlign: 'center' },
});
