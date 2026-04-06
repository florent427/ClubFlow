import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@apollo/client/react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { FamilyScreen } from '../screens/FamilyScreen';
import { HomeContactScreen } from '../screens/HomeContactScreen';
import { HomeDashboardScreen } from '../screens/HomeDashboardScreen';
import { PlanningScreen } from '../screens/PlanningScreen';
import { ProgressionScreen } from '../screens/ProgressionScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { VIEWER_ME } from '../lib/viewer-documents';
import type { ViewerMeData } from '../lib/viewer-types';
import type { ContactTabParamList, MainTabParamList } from '../types/navigation';

const MemberTab = createBottomTabNavigator<MainTabParamList>();
const ContactTab = createBottomTabNavigator<ContactTabParamList>();

export function MemberTabsNavigator() {
  const { data: meData } = useQuery<ViewerMeData>(VIEWER_ME, {
    fetchPolicy: 'cache-first',
  });
  const hideMemberModules = meData?.viewerMe?.hideMemberModules === true;

  return (
    <MemberTab.Navigator
      key={hideMemberModules ? 'min' : 'full'}
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#1565c0',
        tabBarInactiveTintColor: '#666',
      }}
    >
      <MemberTab.Screen
        name="Home"
        component={HomeDashboardScreen}
        options={{
          title: 'Tableau de bord',
          tabBarLabel: 'Accueil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      {!hideMemberModules ? (
        <>
          <MemberTab.Screen
            name="Progression"
            component={ProgressionScreen}
            options={{
              title: 'Ma progression',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="school-outline" size={size} color={color} />
              ),
            }}
          />
          <MemberTab.Screen
            name="Planning"
            component={PlanningScreen}
            options={{
              title: 'Planning',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="calendar-outline" size={size} color={color} />
              ),
            }}
          />
        </>
      ) : null}
      <MemberTab.Screen
        name="Famille"
        component={FamilyScreen}
        options={{
          title: 'Famille & partage',
          tabBarLabel: 'Famille',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <MemberTab.Screen
        name="Parametres"
        component={SettingsScreen}
        options={{
          title: 'Paramètres',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </MemberTab.Navigator>
  );
}

export function ContactTabsNavigator() {
  return (
    <ContactTab.Navigator
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#1565c0',
        tabBarInactiveTintColor: '#666',
      }}
    >
      <ContactTab.Screen
        name="Home"
        component={HomeContactScreen}
        options={{
          title: 'Espace contact',
          tabBarLabel: 'Accueil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </ContactTab.Navigator>
  );
}
