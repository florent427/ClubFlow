import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DocumentsToSignScreen } from './DocumentsToSignScreen';
import { DocumentSignScreen } from './DocumentSignScreen';
import type { DocumentsStackParamList } from '../../types/navigation';

const Stack = createNativeStackNavigator<DocumentsStackParamList>();

/**
 * Sub-stack imbriqué dans la tab "Documents" — permet de naviguer entre
 * la liste des documents à signer et l'écran de signature d'un document
 * spécifique.
 */
export function DocumentsNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#ffffff' },
      }}
    >
      <Stack.Screen
        name="DocumentsToSign"
        component={DocumentsToSignScreen}
      />
      <Stack.Screen
        name="DocumentSign"
        component={DocumentSignScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}
