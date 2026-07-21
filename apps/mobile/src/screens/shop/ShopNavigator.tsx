import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ShopCatalogScreen } from './ShopCatalogScreen';
import { ShopCartScreen } from './ShopCartScreen';
import { palette, typography } from '../../lib/theme';
import type { ShopStackParamList } from '../../types/navigation';

const Stack = createNativeStackNavigator<ShopStackParamList>();

/**
 * Sub-stack imbriqué dans la tab "Boutique" — parcours PANIER en 2 écrans
 * (ADR-0012) :
 *   1. **ShopCatalog** — catalogue, choix de déclinaison, « Ajouter au panier »
 *   2. **ShopCart** — panier dédié : quantités, retrait, checkout Stripe
 *
 * On garde le même pattern que `DocumentsNavigator` / `MessagingNavigator` :
 * `navigation.navigate('Boutique')` continue d'atterrir sur le catalogue sans
 * changer les liens existants (MoreMenu).
 */
export function ShopNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: palette.surface },
        headerTitleStyle: { ...typography.h3, color: palette.ink },
        headerShadowVisible: false,
        headerTintColor: palette.primary,
        contentStyle: { backgroundColor: palette.bg },
      }}
    >
      <Stack.Screen
        name="ShopCatalog"
        component={ShopCatalogScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ShopCart"
        component={ShopCartScreen}
        options={{ title: 'Mon panier', animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}
