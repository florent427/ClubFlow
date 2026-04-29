import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DashboardScreen } from '../../screens/dashboard/DashboardScreen';

const Stack = createNativeStackNavigator();

export function DashboardStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
    </Stack.Navigator>
  );
}
