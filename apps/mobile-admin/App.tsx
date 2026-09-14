import { StatusBar } from 'expo-status-bar'
import { StyleSheet, Text, View } from 'react-native'

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Luminix Admin</Text>
      <Text style={styles.subtitle}>Base Expo pronta para a experiência da gestora.</Text>
      <StatusBar style="auto" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  subtitle: {
    color: '#52525b',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  title: {
    color: '#18181b',
    fontSize: 28,
    fontWeight: '700',
  },
})
