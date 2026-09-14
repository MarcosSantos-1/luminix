import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { CommercialProvider } from './src/contexts/CommercialContext';
// Side-effect: configura NotificationHandler (banner em foreground)
import './src/lib/pushNotifications';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <CommercialProvider>
          <RootNavigator />
        </CommercialProvider>
        <StatusBar style="dark" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
