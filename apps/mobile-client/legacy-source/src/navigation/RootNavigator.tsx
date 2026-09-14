import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { AuthNavigator } from './AuthNavigator';
import { ClientNavigator } from './ClientNavigator';
import { ONBOARDING_SEEN_KEY } from '../screens/OnboardingScreen';
import { preloadOnboardingAssets } from '../assets/brandAssets';
import { AppLoadingScreen } from '../components/AppLoadingScreen';

export function RootNavigator() {
  const { user, firebaseUser, loading } = useAuth();
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);
  const [assetsReady, setAssetsReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_SEEN_KEY)
      .then((v) => setOnboardingSeen(v === 'true'))
      .catch(() => setOnboardingSeen(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Só pré-carrega onboarding se ainda for mostrar (primeiro acesso)
        const seen = await AsyncStorage.getItem(ONBOARDING_SEEN_KEY);
        if (seen !== 'true') {
          await preloadOnboardingAssets();
        }
      } catch {
        // segue mesmo se o prefetch falhar
      } finally {
        if (!cancelled) setAssetsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || onboardingSeen === null || !assetsReady) {
    return <AppLoadingScreen />;
  }

  // App do cliente só com sessão Firebase + usuário sincronizado no backend.
  // Cache sozinho não basta — evita pular onboarding/login direto para anamnese.
  const isAuthenticated = Boolean(firebaseUser && user);

  return (
    <NavigationContainer>
      {isAuthenticated ? (
        <ClientNavigator />
      ) : (
        <AuthNavigator initialRouteName={onboardingSeen ? 'Access' : 'Onboarding'} />
      )}
    </NavigationContainer>
  );
}
