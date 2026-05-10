import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { AdminWebViewScreen } from '../screens/AdminWebViewScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { MainScreen } from '../screens/MainScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';
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
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      <Stack.Screen name="SelectProfile" component={SelectProfileScreen} />
      <Stack.Screen name="Main" component={MainScreen} />
      {/* Mode Admin (WebView). Affiché en modal-like — pas de tab bar. */}
      <Stack.Screen
        name="Admin"
        component={AdminWebViewScreen}
        options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}
