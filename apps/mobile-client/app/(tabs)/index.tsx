import { useRouter } from 'expo-router'
import { ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { durationLabel, priceLabel } from '../../src/api'
import { useStore } from '../../src/store'
import { colors, fonts, paletteFor, radius, shadow } from '../../src/theme'
import { Enter, Icon, Press, Rings, SpaceLogo, type, type IconName } from '../../src/ui'
import { useServices } from '../../src/ui/space'

export default function Home() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { account, space } = useStore()
  const services = useServices()
  if (!account || !space) return null
  const palette = paletteFor(space.theme)
  const firstName = account.name.split(/\s+/)[0]

  const actions: { label: string; icon: IconName; href: '/servicos' | '/agenda' | '/historico' }[] =
    [
      { label: 'Agendar', icon: 'plus', href: '/servicos' },
      { label: 'Meus horários', icon: 'calendar', href: '/agenda' },
      { label: 'Histórico', icon: 'clock', href: '/historico' },
    ]

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 120, gap: 22 }}
    >
      <View
        style={{
          backgroundColor: palette.deep,
          paddingTop: insets.top + 14,
          paddingHorizontal: 20,
          paddingBottom: 26,
          borderBottomLeftRadius: 34,
          borderBottomRightRadius: 34,
          overflow: 'hidden',
          gap: 6,
        }}
      >
        <Rings />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <Press
            onPress={() => router.push('/espacos')}
            label="Trocar de espaço"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              padding: 5,
              paddingRight: 12,
              borderRadius: radius.pill,
              backgroundColor: 'rgba(255,255,255,0.13)',
            }}
          >
            <SpaceLogo space={space} size={30} inverted />
            <Text
              numberOfLines={1}
              style={{ fontFamily: fonts.bodySemi, fontSize: 13.5, color: '#fff', maxWidth: 190 }}
            >
              {space.name}
            </Text>
            <Icon name="chevron-down" size={15} color="#fff" />
          </Press>
          <View style={{ flex: 1 }} />
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: 'rgba(255,255,255,0.13)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            accessibilityLabel="Notificações"
          >
            <Icon name="bell" size={19} color="#fff" />
          </View>
        </View>
        <Enter>
          <Text
            style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: 'rgba(255,255,255,0.72)' }}
          >
            Olá, {firstName}
          </Text>
          <Text style={[type.h1, { color: '#fff', marginTop: 4 }]}>O que vamos cuidar hoje?</Text>
        </Enter>
      </View>

      <Enter delay={120} style={{ paddingHorizontal: 20 }}>
        <View
          style={{
            backgroundColor: palette.deep,
            borderRadius: 28,
            padding: 20,
            gap: 12,
            minHeight: 170,
            overflow: 'hidden',
            justifyContent: 'space-between',
          }}
        >
          <Rings />
          <Text style={[type.kicker, { color: 'rgba(255,255,255,0.72)' }]}>
            Nenhum horário marcado
          </Text>
          <Text style={[type.h2, { color: '#fff', fontSize: 23, lineHeight: 27, maxWidth: 240 }]}>
            Que tal reservar um tempo para você?
          </Text>
          <Press
            onPress={() => router.push('/servicos')}
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: radius.pill,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13.5, color: palette.deep }}>
              Ver serviços
            </Text>
            <Icon name="arrow-right" size={16} color={palette.deep} />
          </Press>
        </View>
      </Enter>

      <Enter delay={200} style={{ flexDirection: 'row', paddingHorizontal: 20 }}>
        {actions.map((action) => (
          <View key={action.label} style={{ flex: 1, alignItems: 'center' }}>
            <Press
              onPress={() => router.push(action.href)}
              label={action.label}
              style={{ alignItems: 'center', gap: 8 }}
            >
              <View
                style={[
                  {
                    width: 58,
                    height: 58,
                    borderRadius: 22,
                    backgroundColor: colors.card,
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                  shadow,
                ]}
              >
                <Icon name={action.icon} size={20} color={palette.deep} />
              </View>
              <Text style={{ fontFamily: fonts.bodySemi, fontSize: 12.5, color: colors.ink }}>
                {action.label}
              </Text>
            </Press>
          </View>
        ))}
      </Enter>

      <Enter delay={280} style={{ gap: 12 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            paddingHorizontal: 20,
          }}
        >
          <Text style={type.h2}>Serviços</Text>
          <Press onPress={() => router.push('/servicos')}>
            <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13.5, color: palette.accent }}>
              Ver todos
            </Text>
          </Press>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 14 }}
        >
          {(services ?? []).slice(0, 6).map((service, index) => {
            const dark = index === 0
            return (
              <View
                key={service.id}
                style={[
                  {
                    width: 172,
                    minHeight: 190,
                    borderRadius: 28,
                    padding: 16,
                    gap: 8,
                    backgroundColor: dark ? palette.deep : colors.card,
                  },
                  shadow,
                ]}
              >
                <Text
                  style={[type.small, { color: dark ? 'rgba(255,255,255,0.72)' : palette.muted }]}
                >
                  {service.category}
                </Text>
                <Text
                  style={{
                    fontFamily: fonts.display,
                    fontSize: 17,
                    lineHeight: 20,
                    color: dark ? '#fff' : colors.ink,
                  }}
                >
                  {service.name}
                </Text>
                <Text
                  style={[type.small, { color: dark ? 'rgba(255,255,255,0.72)' : palette.muted }]}
                >
                  {priceLabel(service)} · {durationLabel(service.durationMinutes)}
                </Text>
              </View>
            )
          })}
          {services === null && (
            <View
              style={{ width: 172, height: 190, borderRadius: 28, backgroundColor: palette.light }}
            />
          )}
        </ScrollView>
      </Enter>
    </ScrollView>
  )
}
