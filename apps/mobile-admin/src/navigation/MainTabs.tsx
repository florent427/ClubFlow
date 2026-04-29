import Ionicons from '@expo/vector-icons/Ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { palette, useClubTheme } from '@clubflow/mobile-shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ViewerProvider } from '../lib/club-modules-context';
import { ActivitiesStack } from './stacks/ActivitiesStack';
import { CommunityStack } from './stacks/CommunityStack';
import { DashboardStack } from './stacks/DashboardStack';
import { MoreStack } from './stacks/MoreStack';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  const { palette: p } = useClubTheme();
  const insets = useSafeAreaInsets();
  // Le rôle membership est calculé via viewerAdminSwitch côté API +
  // les permissions utilisent enabledModules. Ici on passe null en
  // attendant un endpoint dédié pour récupérer le rôle (les écrans
  // appliquent leur propre gating via permissions.ts).
  return (
    <ViewerProvider clubRole={null}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: p.primary,
          tabBarInactiveTintColor: palette.muted,
          tabBarStyle: {
            backgroundColor: palette.surface,
            borderTopColor: palette.border,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 10),
            height: 60 + Math.max(insets.bottom, 10),
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontFamily: 'Inter_600SemiBold',
          },
          tabBarIcon: ({ color, size, focused }) => {
            const map: Record<keyof MainTabParamList, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
              Home: { active: 'grid', inactive: 'grid-outline' },
              Community: { active: 'people', inactive: 'people-outline' },
              Activities: { active: 'calendar', inactive: 'calendar-outline' },
              More: { active: 'menu', inactive: 'menu-outline' },
            };
            const k = route.name as keyof MainTabParamList;
            return (
              <Ionicons
                name={focused ? map[k].active : map[k].inactive}
                size={size}
                color={color}
              />
            );
          },
        })}
      >
        <Tab.Screen
          name="Home"
          component={DashboardStack}
          options={{ tabBarLabel: 'Accueil' }}
        />
        <Tab.Screen
          name="Community"
          component={CommunityStack}
          options={{ tabBarLabel: 'Communauté' }}
        />
        <Tab.Screen
          name="Activities"
          component={ActivitiesStack}
          options={{ tabBarLabel: 'Activités' }}
        />
        <Tab.Screen
          name="More"
          component={MoreStack}
          options={{ tabBarLabel: 'Plus' }}
        />
      </Tab.Navigator>
    </ViewerProvider>
  );
}
