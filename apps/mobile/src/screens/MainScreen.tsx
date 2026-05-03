import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  ContactTabsNavigator,
  MemberTabsNavigator,
} from '../navigation/MainTabs';
import * as storage from '../lib/storage';

export function MainScreen() {
  // eslint-disable-next-line no-console
  console.log('[MainScreen] render');
  const [mode, setMode] = useState<'loading' | 'contact' | 'member'>(
    'loading',
  );

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[MainScreen] useEffect — calling isContactOnlySession');
    void storage
      .isContactOnlySession()
      .then((contact) => {
        // eslint-disable-next-line no-console
        console.log('[MainScreen] isContactOnlySession resolved:', contact);
        setMode(contact ? 'contact' : 'member');
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(
          '[MainScreen] isContactOnlySession FAILED — defaulting to member',
          err,
        );
        // Fallback : si AsyncStorage throw, on suppose member (cas le
        // plus courant) plutôt que de rester bloqué sur loading.
        setMode('member');
      });
  }, []);

  // eslint-disable-next-line no-console
  console.log('[MainScreen] mode =', mode);

  if (mode === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return mode === 'contact' ? (
    <ContactTabsNavigator />
  ) : (
    <MemberTabsNavigator />
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
