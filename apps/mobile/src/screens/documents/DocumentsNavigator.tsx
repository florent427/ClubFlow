import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DocumentsToSignScreen } from './DocumentsToSignScreen';
import { DocumentPreviewScreen } from './DocumentPreviewScreen';
import { DocumentSignScreen } from './DocumentSignScreen';
import type { DocumentsStackParamList } from '../../types/navigation';

const Stack = createNativeStackNavigator<DocumentsStackParamList>();

/**
 * Sub-stack imbriqué dans la tab "Documents" — flux à 3 écrans :
 *   1. **DocumentsToSign** — liste des documents en attente
 *   2. **DocumentPreview** — lecture du PDF en plein écran (obligatoire
 *      avant de pouvoir signer)
 *   3. **DocumentSign** — saisie des champs (signature manuscrite via
 *      modale plein écran, texte, date, case à cocher)
 *
 * Pourquoi un écran d'aperçu dédié ? Cf. commentaire en tête de
 * `DocumentPreviewScreen.tsx`. Pourquoi un écran de signature sans
 * ScrollView ? Cf. commentaire en tête de `DocumentSignScreen.tsx`.
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
        name="DocumentPreview"
        component={DocumentPreviewScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="DocumentSign"
        component={DocumentSignScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}
