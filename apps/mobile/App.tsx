import { ApolloProvider } from '@apollo/client/react';
import {
  NavigationContainer,
  type LinkingOptions,
} from '@react-navigation/native';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
  useFonts,
} from '@expo-google-fonts/inter';
import * as Linking from 'expo-linking';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { apolloClient } from './src/lib/apollo';
import * as storage from './src/lib/storage';
import { palette } from './src/lib/theme';
import { ClubThemeProvider } from './src/lib/theme-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import type { RootStackParamList } from './src/types/navigation';

export default function App() {
  // eslint-disable-next-line no-console
  console.log('[App] boot');
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  });
  const [initialRoute, setInitialRoute] = useState<
    keyof RootStackParamList | null
  >(null);

  // Logs d'avancement du boot — à supprimer une fois le diagnostic fait.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log(
      '[App] fonts state',
      JSON.stringify({ fontsLoaded, fontError: fontError?.message ?? null }),
    );
  }, [fontsLoaded, fontError]);
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[App] initialRoute =', initialRoute);
  }, [initialRoute]);

  useEffect(() => {
    void (async () => {
      try {
        // eslint-disable-next-line no-console
        console.log('[App] storage check…');
        // Si l'app est ouverte par un deep-link verify-email, on traite
        // le token AVANT de regarder la session existante. La logique
        // d'ouverture est gérée par le linking config + VerifyEmailScreen.
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl && initialUrl.includes('verify-email')) {
          setInitialRoute('Login');
          // VerifyEmailScreen sera atteint via le linking config et
          // gérera lui-même la déconnexion préalable si nécessaire.
          return;
        }
        if (await storage.hasMemberSession()) {
          setInitialRoute('Main');
          return;
        }
        const token = await storage.getToken();
        const clubId = await storage.getClubId();
        if (token && !clubId) {
          setInitialRoute('SelectProfile');
          return;
        }
        setInitialRoute('Login');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[App] storage check failed', err);
        setInitialRoute('Login');
      }
    })();
  }, []);

  /**
   * Deep linking : `clubflow://verify-email?token=...` ouvre directement
   * VerifyEmailScreen avec le token en paramètre. Idem pour Register
   * (ouverture directe depuis un email d'invitation).
   */
  const linking = useMemo<LinkingOptions<RootStackParamList>>(
    () => ({
      prefixes: [Linking.createURL('/'), 'clubflow://'],
      config: {
        screens: {
          Login: 'login',
          Register: 'register',
          VerifyEmail: 'verify-email',
          SelectProfile: 'select-profile',
          Main: 'main',
        },
      },
    }),
    [],
  );

  // **Fonts non-bloquantes** : si la CDN Google Fonts est inaccessible
  // (réseau restreint, captive portal…), `useFonts` peut hanger
  // indéfiniment. On ne bloque QUE sur `initialRoute === null` (storage
  // check). Sans les fonts custom, RN tombe sur la system font — visuel
  // dégradé mais l'app est utilisable.
  if (initialRoute === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ApolloProvider client={apolloClient}>
          <ClubThemeProvider>
            <NavigationContainer linking={linking}>
              <RootNavigator initialRouteName={initialRoute} />
            </NavigationContainer>
          </ClubThemeProvider>
        </ApolloProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.bg,
  },
});
