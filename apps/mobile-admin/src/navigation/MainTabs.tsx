import Ionicons from '@expo/vector-icons/Ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { palette, useClubTheme } from '@clubflow/mobile-shared';
import { useEffect, useState } from 'react';
import { ViewerProvider } from '../lib/club-modules-context';
import { storage } from '../lib/storage';
import type { MembershipRole } from '@clubflow/mobile-shared';
import { ActivitiesStack } from './stacks/ActivitiesStack';
import { CommunityStack } from './stacks/CommunityStack';
import { DashboardStack } from './stacks/DashboardStack';
import { MoreStack } from './stacks/MoreStack';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  const { palette: p } = useClubTheme();
  const [clubRole, setClubRole] = useState<MembershipRole | null>(null);

  useEffect(() => {
    void (async () => {
      // En l'absence de query dédiée, on stocke le rôle au login.
      // Pour l'instant on lit un éventuel stockage ; sinon null (= SystemAdmin probable).
      const role = (await storage.raw.get('membership_role')) as MembershipRole | null;
      setClubRole(role ?? null);
    })();
  }, []);

  return (
    <ViewerProvider clubRole={clubRole}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: p.primary,
          tabBarInactiveTintColor: palette.muted,
          tabBarStyle: {
            backgroundColor: palette.surface,
            borderTopColor: palette.border,
            paddingTop: 6,
            paddingBottom: 6,
            height: 64,
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
