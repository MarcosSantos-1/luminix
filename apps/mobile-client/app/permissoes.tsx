import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import * as Notifications from 'expo-notifications'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useStore } from '../src/store'
import { colors, fonts, palettes, radius, shadow } from '../src/theme'
import { Button, Enter, Icon, Press, type, type IconName } from '../src/ui'

type Status = 'idle' | 'granted' | 'denied'

// Each permission is asked only when the person taps it, with the reason on screen first.
const items: {
  key: string
  icon: IconName
  title: string
  body: string
  ask: () => Promise<{ granted: boolean }>
}[] = [
  {
    key: 'notifications',
    icon: 'bell',
    title: 'Notificações',
    body: 'Confirmações, lembretes do dia e avisos do seu espaço.',
    ask: () => Notifications.requestPermissionsAsync(),
  },
  {
    key: 'location',
    icon: 'map-pin',
    title: 'Localização',
    body: 'Para mostrar o caminho até o espaço e, em breve, os que ficam perto de você.',
    ask: () => Location.requestForegroundPermissionsAsync(),
  },
  {
    key: 'camera',
    icon: 'camera',
    title: 'Câmera',
    body: 'Para a foto da sua ficha, usada pela equipe para reconhecer você.',
    ask: () => ImagePicker.requestCameraPermissionsAsync(),
  },
]

export default function Permissions() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { markPermissionsSeen } = useStore()
  const [status, setStatus] = useState<Record<string, Status>>({})
  const palette = palettes.luminix

  async function ask(item: (typeof items)[number]) {
    try {
      const { granted } = await item.ask()
      setStatus((current) => ({ ...current, [item.key]: granted ? 'granted' : 'denied' }))
    } catch {
      // Not available on this platform (for example, the web build): treated as not allowed.
      setStatus((current) => ({ ...current, [item.key]: 'denied' }))
    }
  }

  function done() {
    markPermissionsSeen()
    router.replace('/')
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        padding: 24,
        paddingTop: insets.top + 28,
        paddingBottom: insets.bottom + 24,
        gap: 14,
        flexGrow: 1,
      }}
    >
      <Enter>
        <Text style={[type.kicker, { color: palette.muted }]}>Antes de começar</Text>
        <Text style={[type.h1, { marginTop: 8 }]}>Você decide o que o app pode usar.</Text>
        <Text style={[type.body, { color: palette.muted, marginTop: 10 }]}>
          Nada é obrigatório agora. Dá para mudar depois, no seu perfil.
        </Text>
      </Enter>

      {items.map((item, index) => {
        const state = status[item.key] ?? 'idle'
        return (
          <Enter key={item.key} delay={140 + index * 90}>
            <View
              style={[
                {
                  backgroundColor: colors.card,
                  borderRadius: radius.card,
                  padding: 16,
                  flexDirection: 'row',
                  gap: 14,
                  alignItems: 'center',
                },
                shadow,
              ]}
            >
              <View
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 18,
                  backgroundColor: palette.light,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={item.icon} size={21} color={palette.deep} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={type.strong}>{item.title}</Text>
                <Text style={[type.small, { color: palette.muted }]}>{item.body}</Text>
              </View>
              {state === 'idle' ? (
                <Press
                  onPress={() => ask(item)}
                  label={`Permitir ${item.title}`}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: radius.pill,
                    backgroundColor: palette.deep,
                  }}
                >
                  <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13.5, color: '#fff' }}>
                    Permitir
                  </Text>
                </Press>
              ) : (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 11,
                    paddingVertical: 7,
                    borderRadius: radius.pill,
                    backgroundColor: state === 'granted' ? colors.okBg : palette.light,
                  }}
                >
                  <Icon
                    name={state === 'granted' ? 'check' : 'minus'}
                    size={14}
                    color={state === 'granted' ? colors.ok : palette.muted}
                  />
                  <Text
                    style={{
                      fontFamily: fonts.bodySemi,
                      fontSize: 12.5,
                      color: state === 'granted' ? colors.ok : palette.muted,
                    }}
                  >
                    {state === 'granted' ? 'Permitido' : 'Agora não'}
                  </Text>
                </View>
              )}
            </View>
          </Enter>
        )
      })}

      <View style={{ flex: 1 }} />
      <Enter delay={460}>
        <Button label="Continuar" icon="arrow-right" palette={palette} onPress={done} />
      </Enter>
    </ScrollView>
  )
}
