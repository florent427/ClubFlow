import { ApolloProvider } from '@apollo/client/react';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
  useFonts,
} from '@expo-google-fonts/inter';
import { ClubThemeProvider } from '@clubflow/mobile-shared';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, DeviceEventEmitter, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  createNavigationContainerRef,
  NavigationContainer,
  type LinkingOptions,
} from '@react-navigation/native';
import { apolloClient, SESSION_EXPIRED_EVENT } from './src/lib/apollo';
import { storage } from './src/lib/storage';
import { RootNavigator } from './src/navigation/RootNavigator';
import type { RootStackParamList } from './src/navigation/types';

const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  });
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);

  useEffect(() => {
    void (async () => {
      const has = await storage.hasSession();
      setInitialRoute(has ? 'Main' : 'Login');
    })();
  }, []);

  // Session expirée signalée par l'errorLink Apollo → purge + retour Login
  // (bug QA C1 : avant, l'app restait sur un écran cassé sans issue).
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(SESSION_EXPIRED_EVENT, () => {
      void storage.clearAuth().finally(() => {
        if (navigationRef.isReady()) {
          navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
        }
      });
    });
    return () => sub.remove();
  }, []);

  const linking = useMemo<LinkingOptions<RootStackParamList>>(
    () => ({
      prefixes: [Linking.createURL('/'), 'clubflow-admin://'],
      config: {
        screens: {
          Login: 'login',
          SelectClub: 'select-club',
          VerifyEmail: 'verify-email',
          Main: 'main',
        },
      },
    }),
    [],
  );

  if (!fontsLoaded || initialRoute === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ApolloProvider client={apolloClient}>
          <ClubThemeProvider variant="admin">
            <StatusBar style="light" />
            <NavigationContainer ref={navigationRef} linking={linking}>
              <RootNavigator initialRoute={initialRoute} />
            </NavigationContainer>
          </ClubThemeProvider>
        </ApolloProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
