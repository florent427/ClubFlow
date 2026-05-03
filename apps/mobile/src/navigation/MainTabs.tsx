import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@apollo/client/react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PinGate } from '../components/PinGate';
import { ActivitiesHubScreen } from '../screens/ActivitiesHubScreen';
import { BookingScreen } from '../screens/BookingScreen';
import { DocumentsNavigator } from '../screens/documents/DocumentsNavigator';
import { EventsScreen } from '../screens/EventsScreen';
import { FamilyScreen } from '../screens/FamilyScreen';
import { HomeContactScreen } from '../screens/HomeContactScreen';
import { HomeDashboardScreen } from '../screens/HomeDashboardScreen';
import { MessagingNavigator } from '../screens/messaging/MessagingNavigator';
import { MoreMenuScreen } from '../screens/MoreMenuScreen';
import { NewsScreen } from '../screens/NewsScreen';
import { PlanningScreen } from '../screens/PlanningScreen';
import { ProgressionScreen } from '../screens/ProgressionScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { VIEWER_ME } from '../lib/viewer-documents';
import type { ViewerMeData } from '../lib/viewer-types';
import { palette, typography } from '../lib/theme';
import { useClubTheme } from '../lib/theme-context';
import type { ContactTabParamList, MainTabParamList } from '../types/navigation';

const MemberTab = createBottomTabNavigator<MainTabParamList>();
const ContactTab = createBottomTabNavigator<ContactTabParamList>();

/**
 * Architecture **5 onglets max** (anti-overflow) :
 *
 *   1. **Accueil** — Dashboard
 *   2. **Activités** — hub Planning / Réservations / Événements
 *   3. **Chat** — Messagerie
 *   4. **Famille** — Foyer + factures
 *   5. **Plus** — overflow grid : Documents, Actus, Progression, Profil
 *
 * Les écrans secondaires (Planning, Réservations, Évenements, Documents,
 * Actus, Progression, Parametres) restent **enregistrés** comme tabs
 * mais sont rendus invisibles dans la tab bar via `tabBarButton: () => null`.
 * Avantage : les `navigation.navigate('Documents')` du HomeDashboard
 * continuent de fonctionner sans changement, et le ActivitiesHubScreen
 * peut router vers Planning/Réservations/Événements en un seul tap.
 *
 * Pourquoi 5 tabs et pas 4 ?
 * - 5 = limite UX iOS / Material recommandée pour de la navigation racine
 * - Permet de tenir Famille + Activités + Chat sans compromis
 * - Au-delà de 5, les labels deviennent illisibles (cf. screenshots avant
 *   refactor : "Pla…", "Rés…", "Eve…", etc.)
 */
export function MemberTabsNavigator() {
  // eslint-disable-next-line no-console
  console.log('[MemberTabsNavigator] render');
  const insets = useSafeAreaInsets();
  const clubTheme = useClubTheme();
  const tint = clubTheme.isClubBranded
    ? clubTheme.palette.primary
    : palette.primary;
  const { data: meData } = useQuery<ViewerMeData>(VIEWER_ME, {
    fetchPolicy: 'cache-first',
  });
  const hideMemberModules = meData?.viewerMe?.hideMemberModules === true;
  // eslint-disable-next-line no-console
  console.log(
    '[MemberTabsNavigator] meData?',
    Boolean(meData),
    'hideMemberModules?',
    hideMemberModules,
  );

  const bottomInset = insets.bottom;

  return (
    /*
      PinGate au niveau racine : si le profil actif a un PIN payeur
      défini ET n'a pas encore été déverrouillé dans cette session,
      l'utilisateur voit l'écran PIN AVANT d'accéder à la tab bar.
      Pour les profils sans PIN ou déjà déverrouillés, le gate
      passe-through transparent.
      Le state `unlockedProfileIds` est volatile (mémoire process) →
      à chaque switch profil ou redémarrage app, le PIN est
      redemandé pour le profil protégé.
    */
    <PinGate>
    <MemberTab.Navigator
      key={hideMemberModules ? 'min' : 'full'}
      // Démarre sur Accueil par défaut.
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerShown: route.name !== 'Home',
        headerStyle: { backgroundColor: palette.surface },
        headerTitleStyle: { ...typography.h3, color: palette.ink },
        headerShadowVisible: false,
        tabBarActiveTintColor: tint,
        tabBarInactiveTintColor: palette.muted,
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopWidth: 0,
          elevation: 12,
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
          height: 64 + bottomInset,
          paddingTop: 6,
          paddingBottom: 8 + bottomInset,
        },
        tabBarLabelStyle: {
          ...typography.caption,
          fontSize: 11,
          marginTop: 2,
        },
      })}
    >
      {/* ─── 1. ACCUEIL (visible) ──────────────────────────────────── */}
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

      {/* ─── 2. ACTIVITÉS (visible, masqué si contact pur) ─────────── */}
      {!hideMemberModules ? (
        <MemberTab.Screen
          name="Activites"
          component={ActivitiesHubScreen}
          options={{
            title: 'Activités',
            tabBarLabel: 'Activités',
            tabBarIcon: ({ color, size }) => (
              <Ionicons
                name="rocket-outline"
                size={size}
                color={color}
              />
            ),
          }}
        />
      ) : null}

      {/* ─── 3. CHAT / Messagerie (visible) ─────────────────────────── */}
      <MemberTab.Screen
        name="Messagerie"
        component={MessagingNavigator}
        options={({ route }) => {
          // `getFocusedRouteNameFromRoute` est l'API officielle pour
          // récupérer le nom de la route nested actuellement focused.
          // Plus fiable que `route.state` (qui peut être undefined sur
          // les premiers renders).
          const focused =
            getFocusedRouteNameFromRoute(route) ?? 'MessagingHome';
          const hideTabBar =
            focused === 'MessagingThread' || focused === 'NewChat';
          return {
            headerShown: false,
            tabBarLabel: 'Chat',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="chatbubbles-outline" size={size} color={color} />
            ),
            tabBarStyle: hideTabBar ? { display: 'none' } : undefined,
          };
        }}
      />

      {/* ─── 4. FAMILLE (visible) ──────────────────────────────────── */}
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

      {/* ─── 5. PLUS — overflow menu (visible) ─────────────────────── */}
      <MemberTab.Screen
        name="Plus"
        component={MoreMenuScreen}
        options={{
          headerShown: false,
          tabBarLabel: 'Plus',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="apps-outline" size={size} color={color} />
          ),
        }}
      />

      {/* ─── ÉCRANS SECONDAIRES (cachés mais navigables) ──────────── */}
      {/* Accessibles depuis ActivitiesHubScreen (Planning/Réservations/Events)
          ou depuis MoreMenuScreen (Documents/Actus/Progression/Profil).
          On les laisse comme tabs pour que `navigation.navigate('Documents')`
          continue de fonctionner depuis n'importe quel écran sans casser
          les liens existants (HomeDashboard, etc.). */}
      {!hideMemberModules ? (
        <>
          <MemberTab.Screen
            name="Progression"
            component={ProgressionScreen}
            options={{
              title: 'Ma progression',
              tabBarButton: () => null,
              tabBarItemStyle: { display: 'none' },
            }}
          />
          <MemberTab.Screen
            name="Planning"
            component={PlanningScreen}
            options={{
              title: 'Planning',
              tabBarButton: () => null,
              tabBarItemStyle: { display: 'none' },
            }}
          />
          <MemberTab.Screen
            name="Reservations"
            component={BookingScreen}
            options={{
              title: 'Réservations',
              tabBarButton: () => null,
              tabBarItemStyle: { display: 'none' },
            }}
          />
        </>
      ) : null}
      <MemberTab.Screen
        name="Actus"
        component={NewsScreen}
        options={{
          title: 'Vie du club',
          tabBarButton: () => null,
          tabBarItemStyle: { display: 'none' },
        }}
      />
      <MemberTab.Screen
        name="Evenements"
        component={EventsScreen}
        options={{
          title: 'Événements',
          tabBarButton: () => null,
          tabBarItemStyle: { display: 'none' },
        }}
      />
      <MemberTab.Screen
        name="Documents"
        component={DocumentsNavigator}
        options={({ route }) => {
          const focused =
            getFocusedRouteNameFromRoute(route) ?? 'DocumentsToSign';
          // Sur les sous-écrans (Preview/Sign), on cache aussi la tab bar.
          const hideTabBar =
            focused === 'DocumentSign' || focused === 'DocumentPreview';
          return {
            headerShown: false,
            title: 'Documents',
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' },
            tabBarStyle: hideTabBar ? { display: 'none' } : undefined,
          };
        }}
      />
      <MemberTab.Screen
        name="Parametres"
        component={SettingsScreen}
        options={{
          title: 'Paramètres',
          tabBarButton: () => null,
          tabBarItemStyle: { display: 'none' },
        }}
      />
    </MemberTab.Navigator>
    </PinGate>
  );
}

export function ContactTabsNavigator() {
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;
  return (
    <ContactTab.Navigator
      screenOptions={({ route }) => ({
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
          height: 64 + bottomInset,
          paddingTop: 6,
          paddingBottom: 8 + bottomInset,
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
      <ContactTab.Screen
        name="Documents"
        component={DocumentsNavigator}
        options={({ route }) => {
          const focused =
            getFocusedRouteNameFromRoute(route) ?? 'DocumentsToSign';
          const hideTabBar =
            focused === 'DocumentSign' || focused === 'DocumentPreview';
          return {
            headerShown: false,
            title: 'Documents',
            tabBarLabel: 'Docs',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="document-text-outline" size={size} color={color} />
            ),
            tabBarStyle: hideTabBar ? { display: 'none' } : undefined,
          };
        }}
      />
    </ContactTab.Navigator>
  );
}
