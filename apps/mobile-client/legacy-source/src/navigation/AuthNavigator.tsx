import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { AccessScreen } from '../screens/AccessScreen';

export type AuthStackParamList = {
  Onboarding: undefined;
  Access: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

interface AuthNavigatorProps {
  initialRouteName: keyof AuthStackParamList;
}

export function AuthNavigator({ initialRouteName }: AuthNavigatorProps) {
  return (
    <Stack.Navigator initialRouteName={initialRouteName} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Onboarding">
        {({ navigation }) => (
          <OnboardingScreen onFinish={() => navigation.replace('Access')} />
        )}
      </Stack.Screen>
      <Stack.Screen name="Access" component={AccessScreen} />
    </Stack.Navigator>
  );
}
