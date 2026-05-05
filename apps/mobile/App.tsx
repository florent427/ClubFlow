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
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from './src/components/ErrorBoundary';

// Empêche le splash screen Expo de se cacher automatiquement avant
// que l'app soit prête (storage check + fonts). Sans ça, le splash
// peut soit disparaître trop tôt (flash blanc) soit rester bloqué
// sur certaines configs (SDK 55 + Bridgeless = comportement instable).
// Le call est wrap dans try/catch car en dev avec hot reload, le
// splash peut déjà être hide → l'appel throw une seconde fois.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);
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
        // Deep-link `clubflow://?club=<slug>` (envoyé par email
        // d'invitation, vitrine, etc.) → pré-config le club avant
        // d'aller sur Login.
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          try {
            const parsed = Linking.parse(initialUrl);
            const slugFromDeepLink =
              typeof parsed.queryParams?.club === 'string'
                ? parsed.queryParams.club.trim().toLowerCase()
                : null;
            if (slugFromDeepLink && /^[a-z0-9-]+$/.test(slugFromDeepLink)) {
              // On stocke un club minimal (id vide → reset par
              // SelectClubScreen au prochain choix manuel ou au login
              // qui résout le vrai id via la query). Solution simple :
              // forcer SelectClubScreen avec ce slug pré-rempli est
              // possible mais pas critique au MVP.
              // eslint-disable-next-line no-console
              console.log('[App] deep-link club slug =', slugFromDeepLink);
            }
          } catch {
            /* parse échoue → on ignore le deep-link */
          }
        }
        if (initialUrl && initialUrl.includes('verify-email')) {
          setInitialRoute('Login');
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
        // Multi-tenant : si aucun club n'a été choisi, on commence par
        // SelectClubScreen au lieu de Login (Login a besoin du club
        // pour le branding + savoir où chercher l'utilisateur).
        const selected = await storage.getSelectedClub();
        if (!selected) {
          setInitialRoute('SelectClub');
          return;
        }
        setInitialRoute('Login');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[App] storage check failed', err);
        setInitialRoute('SelectClub');
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
          SelectClub: 'select-club',
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

  // Cache le splash screen Expo dès que l'app est prête à rendre.
  // eslint-disable-next-line no-console
  console.log('[App] hiding splash screen, rendering RootNavigator');
  void SplashScreen.hideAsync().catch(() => undefined);

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
