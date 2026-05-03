import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivitiesHomeScreen } from '../../screens/activities/ActivitiesHomeScreen';
import { BookingScreen } from '../../screens/booking/BookingScreen';
import { BookingSlotDetailScreen } from '../../screens/booking/BookingSlotDetailScreen';
import { CourseSlotDetailScreen } from '../../screens/planning/CourseSlotDetailScreen';
import { EventDetailScreen } from '../../screens/events/EventDetailScreen';
import { EventRegistrationsScreen } from '../../screens/events/EventRegistrationsScreen';
import { EventsScreen } from '../../screens/events/EventsScreen';
import { NewCourseSlotScreen } from '../../screens/planning/NewCourseSlotScreen';
import { NewEventScreen } from '../../screens/events/NewEventScreen';
import { NewProjectScreen } from '../../screens/projects/NewProjectScreen';
import { PlanningScreen } from '../../screens/planning/PlanningScreen';
import { ProjectDetailScreen } from '../../screens/projects/ProjectDetailScreen';
import { ProjectLivePhaseScreen } from '../../screens/projects/ProjectLivePhaseScreen';
import { ProjectsScreen } from '../../screens/projects/ProjectsScreen';

const Stack = createNativeStackNavigator();

/**
 * Stack "Activités" : racine = écran de choix (ActivitiesHomeScreen)
 * qui aiguille vers Planning / Événements / Projets / Réservations.
 * Chaque sous-écran a un back button qui ramène à la racine.
 */
export function ActivitiesStack() {
  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Home" component={ActivitiesHomeScreen} />
      <Stack.Screen name="Planning" component={PlanningScreen} />
      <Stack.Screen name="CourseSlotDetail" component={CourseSlotDetailScreen} />
      <Stack.Screen name="NewCourseSlot" component={NewCourseSlotScreen} />
      <Stack.Screen name="Events" component={EventsScreen} />
      <Stack.Screen name="EventDetail" component={EventDetailScreen} />
      <Stack.Screen name="EventRegistrations" component={EventRegistrationsScreen} />
      <Stack.Screen name="NewEvent" component={NewEventScreen} />
      <Stack.Screen name="Projects" component={ProjectsScreen} />
      <Stack.Screen name="ProjectDetail" component={ProjectDetailScreen} />
      <Stack.Screen name="ProjectLivePhase" component={ProjectLivePhaseScreen} />
      <Stack.Screen name="NewProject" component={NewProjectScreen} />
      <Stack.Screen name="Booking" component={BookingScreen} />
      <Stack.Screen name="BookingSlotDetail" component={BookingSlotDetailScreen} />
    </Stack.Navigator>
  );
}
