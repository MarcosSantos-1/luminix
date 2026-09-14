import { View, ActivityIndicator, StyleSheet, Image, Text } from 'react-native';
import { logoSource } from '../assets/brandAssets';
import { brand } from '../theme/brand';

/** Splash de carregamento (logo + spinner) — usado no boot e pós-login. */
export function AppLoadingScreen({ message = 'Charme & Bela' }: { message?: string }) {
  return (
    <View style={styles.loading}>
      <Image source={logoSource} style={styles.loadingLogo} resizeMode="contain" />
      <Text style={styles.loadingText}>{message}</Text>
      <ActivityIndicator size="small" color={brand.rose} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: brand.background,
  },
  loadingLogo: {
    width: 96,
    height: 96,
    marginBottom: 20,
  },
  spinner: {
    marginTop: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
    color: brand.muted,
    letterSpacing: 1,
  },
});
