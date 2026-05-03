import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { SelectClubScreen } from '../screens/auth/SelectClubScreen';
import { VerifyEmailScreen } from '../screens/auth/VerifyEmailScreen';
import { MainTabs } from './MainTabs';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator({
  initialRoute,
}: {
  initialRoute: keyof RootStackParamList;
}) {
  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SelectClub" component={SelectClubScreen} />
      <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      <Stack.Screen name="Main" component={MainTabs} />
    </Stack.Navigator>
  );
}
