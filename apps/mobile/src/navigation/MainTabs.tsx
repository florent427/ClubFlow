import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@apollo/client/react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BookingScreen } from '../screens/BookingScreen';
import { EventsScreen } from '../screens/EventsScreen';
import { FamilyScreen } from '../screens/FamilyScreen';
import { HomeContactScreen } from '../screens/HomeContactScreen';
import { HomeDashboardScreen } from '../screens/HomeDashboardScreen';
import { MessagingScreen } from '../screens/MessagingScreen';
import { NewsScreen } from '../screens/NewsScreen';
import { PlanningScreen } from '../screens/PlanningScreen';
import { ProgressionScreen } from '../screens/ProgressionScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { VIEWER_ME } from '../lib/viewer-documents';
import type { ViewerMeData } from '../lib/viewer-types';
import { palette, typography } from '../lib/theme';
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
      screenOptions={({ route }) => ({
        // Le Dashboard / HomeContact gèrent leur propre hero gradient
        // donc on cache le header système. Les autres écrans gardent
        // le header default (sans ombre, fond surface).
        headerShown: route.name !== 'Home',
        headerStyle: { backgroundColor: palette.surface },
        headerTitleStyle: { ...typography.h3, color: palette.ink },
        headerShadowVisible: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.muted,
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopWidth: 0,
          elevation: 12,
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          ...typography.caption,
          fontSize: 11,
          marginTop: 2,
        },
      })}
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
          <MemberTab.Screen
            name="Reservations"
            component={BookingScreen}
            options={{
              title: 'Réservations',
              tabBarLabel: 'Réserver',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="checkmark-circle-outline" size={size} color={color} />
              ),
            }}
          />
        </>
      ) : null}
      <MemberTab.Screen
        name="Actus"
        component={NewsScreen}
        options={{
          title: 'Vie du club',
          tabBarLabel: 'Actus',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="megaphone-outline" size={size} color={color} />
          ),
        }}
      />
      <MemberTab.Screen
        name="Evenements"
        component={EventsScreen}
        options={{
          title: 'Événements',
          tabBarLabel: 'Events',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="star-outline" size={size} color={color} />
          ),
        }}
      />
      <MemberTab.Screen
        name="Messagerie"
        component={MessagingScreen}
        options={{
          title: 'Messagerie',
          tabBarLabel: 'Chat',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      />
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
          tabBarLabel: 'Profil',
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
      screenOptions={({ route }) => ({
        // Le Dashboard / HomeContact gèrent leur propre hero gradient
        // donc on cache le header système. Les autres écrans gardent
        // le header default (sans ombre, fond surface).
        headerShown: route.name !== 'Home',
        headerStyle: { backgroundColor: palette.surface },
        headerTitleStyle: { ...typography.h3, color: palette.ink },
        headerShadowVisible: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.muted,
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopWidth: 0,
          elevation: 12,
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          ...typography.caption,
          fontSize: 11,
          marginTop: 2,
        },
      })}
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
      <ContactTab.Screen
        name="Actus"
        component={NewsScreen}
        options={{
          title: 'Vie du club',
          tabBarLabel: 'Actus',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="megaphone-outline" size={size} color={color} />
          ),
        }}
      />
      <ContactTab.Screen
        name="Evenements"
        component={EventsScreen}
        options={{
          title: 'Événements',
          tabBarLabel: 'Events',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="star-outline" size={size} color={color} />
          ),
        }}
      />
    </ContactTab.Navigator>
  );
}
