import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useStore } from '../src/store'
import { palettes } from '../src/theme'

/** Single place that decides where a person lands, from what the device already knows. */
export default function Gate() {
  const { ready, seenIntro, account, space } = useStore()
  if (!ready)
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palettes.luminix.deep,
        }}
      >
        <ActivityIndicator color="#ffffff" />
      </View>
    )
  if (!account) return <Redirect href={seenIntro ? '/entrar' : '/boas-vindas'} />
  if (!account.permissionsSeen) return <Redirect href="/permissoes" />
  if (!space) return <Redirect href="/espacos" />
  return <Redirect href="/(tabs)" />
}
