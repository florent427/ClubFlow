import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MessagingHomeScreen } from './MessagingHomeScreen';
import { MessagingThreadScreen } from './MessagingThreadScreen';
import type { MessagingStackParamList } from './types';

const Stack = createNativeStackNavigator<MessagingStackParamList>();

/**
 * Sub-stack imbriqué dans la tab "Chat" — permet de naviguer entre la
 * liste des salons et la conversation d'un salon en gardant le bouton
 * retour natif de la stack et l'animation slide.
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
    </Stack.Navigator>
  );
}
