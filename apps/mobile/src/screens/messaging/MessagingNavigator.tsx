import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MessagingHomeScreen } from './MessagingHomeScreen';
import { MessagingThreadScreen } from './MessagingThreadScreen';
import { NewChatScreen } from './NewChatScreen';
import type { MessagingStackParamList } from './types';

const Stack = createNativeStackNavigator<MessagingStackParamList>();

/**
 * Sub-stack imbriqué dans la tab "Chat" — permet de naviguer entre :
 *  - la **liste des salons** (MessagingHome)
 *  - une **conversation** d'un salon (MessagingThread)
 *  - la **recherche d'adhérents** pour démarrer un chat 1-on-1
 *    (NewChat)
 */
export function MessagingNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#ffffff' },
      }}
    >
      <Stack.Screen name="MessagingHome" component={MessagingHomeScreen} />
      <Stack.Screen
        name="MessagingThread"
        component={MessagingThreadScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="NewChat"
        component={NewChatScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}
