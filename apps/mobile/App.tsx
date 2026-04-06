import { ApolloProvider } from '@apollo/client/react';
import { NavigationContainer } from '@react-navigation/native';
import { useEffect, useState } from 'react';
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
        <NavigationContainer>
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
