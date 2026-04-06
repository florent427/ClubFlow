import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  ContactTabsNavigator,
  MemberTabsNavigator,
} from '../navigation/MainTabs';
import * as storage from '../lib/storage';

export function MainScreen() {
  const [mode, setMode] = useState<'loading' | 'contact' | 'member'>(
    'loading',
  );

  useEffect(() => {
    void storage.isContactOnlySession().then((contact) => {
      setMode(contact ? 'contact' : 'member');
    });
  }, []);

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
