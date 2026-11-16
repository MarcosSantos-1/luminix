import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useStore } from '../src/store'
import { palettes } from '../src/theme'

/** Single place that decides where a person lands, from what the account already has. */
export default function Gate() {
  const { ready, seenIntro, permissionsSeen, account, space, anamnesis } = useStore()
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
  if (!permissionsSeen) return <Redirect href="/permissoes" />
  if (!account.anamnesis) return <Redirect href="/anamnese" />
  if (!space) return <Redirect href="/espacos" />
  // The space did not get the account record and has none of its own yet.
  if (!anamnesis) return <Redirect href={`/anamnese?espaco=${space.summary.slug}`} />
  return <Redirect href="/(tabs)" />
}
