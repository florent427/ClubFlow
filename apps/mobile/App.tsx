import { ApolloProvider } from '@apollo/client/react';
import {
  NavigationContainer,
  type LinkingOptions,
} from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { apolloClient } from './src/lib/apollo';
import * as storage from './src/lib/storage';
import { RootNavigator } from './src/navigation/RootNavigator';
import type { RootStackParamList } from './src/types/navigation';

export default function App() {
  const [initialRoute, setInitialRoute] = useState<
    keyof RootStackParamList | null
  >(null);

  useEffect(() => {
    void (async () => {
      try {
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
      } catch {
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

  if (initialRoute === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ApolloProvider client={apolloClient}>
        <NavigationContainer linking={linking}>
          <RootNavigator initialRouteName={initialRoute} />
        </NavigationContainer>
      </ApolloProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
