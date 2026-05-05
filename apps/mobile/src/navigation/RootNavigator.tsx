import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { LoginScreen } from '../screens/LoginScreen';
import { MainScreen } from '../screens/MainScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { SelectClubScreen } from '../screens/SelectClubScreen';
import { SelectProfileScreen } from '../screens/SelectProfileScreen';
import { VerifyEmailScreen } from '../screens/VerifyEmailScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

type Props = {
  initialRouteName: keyof RootStackParamList;
};

export function RootNavigator({ initialRouteName }: Props) {
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="SelectClub" component={SelectClubScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      <Stack.Screen name="SelectProfile" component={SelectProfileScreen} />
      <Stack.Screen name="Main" component={MainScreen} />
    </Stack.Navigator>
  );
}
