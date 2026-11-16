import { useRouter } from 'expo-router'
import { useRef } from 'react'
import { Animated, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { durationLabel, priceLabel, type Service } from '../../src/api'
import { firstName, relativeDay } from '../../src/format'
import { displayStatus, useStore } from '../../src/store'
import { colors, fonts, paletteFor, radius, shadow } from '../../src/theme'
import { Enter, Icon, Press, Rings, SpaceLogo, type, type IconName } from '../../src/ui'
import { Avatar, StatusBadge, money, useServices } from '../../src/ui/space'

type Slide = { key: string; tone: 'deep' | 'accent' | 'light'; node: React.ReactNode }

/** Paged highlights with dots that stretch under the finger. */
function Slider({ slides }: { slides: Slide[] }) {
  const { width } = useWindowDimensions()
  const card = width - 40
  const scroll = useRef(new Animated.Value(0)).current
  const { space } = useStore()
  const palette = paletteFor(space?.summary.theme)
  const background = { deep: palette.deep, accent: palette.accent, light: palette.light }
  return (
    <View style={{ gap: 12 }}>
      <Animated.ScrollView
        horizontal
        pagingEnabled
        snapToInterval={card + 12}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scroll } } }], {
          useNativeDriver: false,
        })}
        scrollEventThrottle={16}
      >
        {slides.map((slide) => (
          <View
            key={slide.key}
            style={{
              width: card,
              minHeight: 176,
              borderRadius: 28,
              padding: 20,
              overflow: 'hidden',
              justifyContent: 'space-between',
              gap: 12,
              backgroundColor: background[slide.tone],
            }}
          >
            {slide.tone !== 'light' && <Rings />}
            {slide.node}
          </View>
        ))}
      </Animated.ScrollView>
      {slides.length > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          {slides.map((slide, index) => {
            const range = [
              (index - 1) * (card + 12),
              index * (card + 12),
              (index + 1) * (card + 12),
            ]
            return (
              <Animated.View
                key={slide.key}
                style={{
                  height: 7,
                  borderRadius: radius.pill,
                  backgroundColor: palette.deep,
                  width: scroll.interpolate({
                    inputRange: range,
                    outputRange: [7, 22, 7],
                    extrapolate: 'clamp',
                  }),
                  opacity: scroll.interpolate({
                    inputRange: range,
                    outputRange: [0.25, 1, 0.25],
                    extrapolate: 'clamp',
                  }),
                }}
              />
            )
          })}
        </View>
      )}
    </View>
  )
}

export default function Home() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { account, space, anamnesis, appointments, unread, refresh, refreshing } = useStore()
  const services = useServices()
  if (!account || !space) return null
  const palette = paletteFor(space.summary.theme)
  const upcoming = (appointments ?? [])
    .filter((item) => ['confirmed', 'requested'].includes(displayStatus(item)))
    .sort((a, b) => a.start.localeCompare(b.start))
  const next = upcoming[0]
  const promos = (services ?? []).filter((item: Service) => item.promoPercent)
  const light = 'rgba(255,255,255,0.74)'

  const slides: Slide[] = [
    {
      key: 'next',
      tone: 'deep',
      node: next ? (
        <>
          <Text style={[type.kicker, { color: light }]}>Seu próximo horário</Text>
          <View style={{ gap: 6 }}>
            <Text style={[type.h2, { color: '#fff', fontSize: 23 }]}>{next.serviceName}</Text>
            <Text style={[type.body, { color: light }]}>
              {relativeDay(next.start)} · {next.start.slice(11, 16)} ·{' '}
              {durationLabel(next.durationMinutes)}
              {next.professionalName ? `\ncom ${next.professionalName}` : ''}
            </Text>
          </View>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <StatusBadge appointment={next} />
            <Press
              onPress={() => router.push('/agenda')}
              label="Ver na agenda"
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: '#fff',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="arrow-right" size={18} color={palette.deep} />
            </Press>
          </View>
        </>
      ) : (
        <>
          <Text style={[type.kicker, { color: light }]}>Nenhum horário marcado</Text>
          <Text style={[type.h2, { color: '#fff', fontSize: 23, maxWidth: 250 }]}>
            Que tal reservar um tempo para você?
          </Text>
          <Press
            onPress={() => router.push('/agendar')}
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
              Agendar agora
            </Text>
            <Icon name="arrow-right" size={16} color={palette.deep} />
          </Press>
        </>
      ),
    },
    ...promos.slice(0, 3).map((service: Service): Slide => ({
      key: `promo-${service.id}`,
      tone: 'accent',
      node: (
        <>
          <Text style={[type.kicker, { color: light }]}>{service.promoPercent}% de desconto</Text>
          <View style={{ gap: 4 }}>
            <Text style={[type.h2, { color: '#fff', fontSize: 23 }]}>{service.name}</Text>
            {service.promoPriceCents != null && (
              <Text style={[type.body, { color: light }]}>
                De {money(service.priceCents)} por {money(service.promoPriceCents)}
              </Text>
            )}
          </View>
          <Press
            onPress={() => router.push(`/agendar?servico=${service.id}`)}
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
              Aproveitar
            </Text>
            <Icon name="arrow-right" size={16} color={palette.deep} />
          </Press>
        </>
      ),
    })),
    ...(space.summary.address || space.summary.city
      ? [
          {
            key: 'where',
            tone: 'light',
            node: (
              <>
                <Text style={[type.kicker, { color: palette.muted }]}>Onde fica</Text>
                <View style={{ gap: 4 }}>
                  <Text style={[type.h2, { color: palette.deep, fontSize: 21 }]}>
                    {space.summary.name}
                  </Text>
                  <Text style={[type.body, { color: palette.muted }]}>
                    {[space.summary.address, space.summary.city].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Press
                  onPress={() => router.push(`/espaco/${space.summary.slug}`)}
                  style={{
                    alignSelf: 'flex-start',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: radius.pill,
                    backgroundColor: palette.deep,
                  }}
                >
                  <Icon name="map-pin" size={15} color="#fff" />
                  <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13.5, color: '#fff' }}>
                    Ver no mapa
                  </Text>
                </Press>
              </>
            ),
          } satisfies Slide,
        ]
      : []),
  ]

  const actions: {
    label: string
    icon: IconName
    href: '/agendar' | '/agenda' | '/historico' | '/notificacoes'
  }[] = [
    { label: 'Agendar', icon: 'plus', href: '/agendar' },
    { label: 'Meus horários', icon: 'calendar', href: '/agenda' },
    { label: 'Histórico', icon: 'clock', href: '/historico' },
    { label: 'Avisos', icon: 'bell', href: '/notificacoes' },
  ]

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 120, gap: 22 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#fff" />
      }
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
            <SpaceLogo space={space.summary} size={30} inverted />
            <Text
              numberOfLines={1}
              style={{ fontFamily: fonts.bodySemi, fontSize: 13.5, color: '#fff', maxWidth: 170 }}
            >
              {space.summary.name}
            </Text>
            <Icon name="chevron-down" size={15} color="#fff" />
          </Press>
          <View style={{ flex: 1 }} />
          <Press
            onPress={() => router.push('/notificacoes')}
            label={unread ? `Notificações, ${unread} não lidas` : 'Notificações'}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: 'rgba(255,255,255,0.13)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="bell" size={19} color="#fff" />
            {unread > 0 && (
              <View
                style={{
                  position: 'absolute',
                  top: -3,
                  right: -3,
                  minWidth: 19,
                  height: 19,
                  paddingHorizontal: 5,
                  borderRadius: 10,
                  backgroundColor: '#fff',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: palette.deep }}>
                  {unread > 9 ? '9+' : unread}
                </Text>
              </View>
            )}
          </Press>
          <Press onPress={() => router.push('/perfil')} label="Seu perfil">
            <Avatar name={account.name} photo={anamnesis?.photo} size={42} />
          </Press>
        </View>
        <Enter>
          <Text style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: light }}>
            Olá, {firstName(account.name)}
          </Text>
          <Text style={[type.h1, { color: '#fff', marginTop: 4 }]}>O que vamos cuidar hoje?</Text>
        </Enter>
        <Press
          onPress={() => router.push('/servicos')}
          label="Buscar serviço"
          style={{
            marginTop: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            minHeight: 52,
            borderRadius: 18,
            paddingHorizontal: 16,
            backgroundColor: '#fff',
          }}
        >
          <Icon name="search" size={18} color={palette.muted} />
          <Text style={[type.body, { color: '#a2a2ae' }]}>Buscar serviço</Text>
        </Press>
      </View>

      <Enter delay={120}>
        <Slider slides={slides} />
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
                {action.href === '/notificacoes' && unread > 0 && (
                  <View
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 12,
                      width: 9,
                      height: 9,
                      borderRadius: 5,
                      backgroundColor: palette.accent,
                    }}
                  />
                )}
              </View>
              <Text style={{ fontFamily: fonts.bodySemi, fontSize: 12.5, color: colors.ink }}>
                {action.label}
              </Text>
            </Press>
          </View>
        ))}
      </Enter>

      {upcoming.length > 1 && (
        <Enter delay={240} style={{ paddingHorizontal: 20, gap: 10 }}>
          <Text style={type.h2}>Próximos horários</Text>
          {upcoming.slice(1, 4).map((item) => (
            <Press
              key={item.id}
              onPress={() => router.push('/agenda')}
              style={[
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 14,
                  borderRadius: 20,
                  backgroundColor: colors.card,
                },
                shadow,
              ]}
            >
              <View
                style={{
                  width: 50,
                  paddingVertical: 7,
                  borderRadius: 15,
                  backgroundColor: palette.light,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontFamily: fonts.display, fontSize: 19, color: palette.deep }}>
                  {item.start.slice(8, 10)}
                </Text>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: palette.deep }}>
                  {item.start.slice(11, 16)}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={type.strong} numberOfLines={1}>
                  {item.serviceName}
                </Text>
                <Text style={[type.small, { color: palette.muted }]}>
                  {relativeDay(item.start)}
                </Text>
              </View>
              <StatusBadge appointment={item} />
            </Press>
          ))}
        </Enter>
      )}

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
              <Press
                key={service.id}
                onPress={() => router.push(`/agendar?servico=${service.id}`)}
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
                <Text style={[type.small, { color: dark ? light : palette.muted }]}>
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
                <Text style={[type.small, { color: dark ? light : palette.muted }]}>
                  {priceLabel(service)} · {durationLabel(service.durationMinutes)}
                </Text>
                <View
                  style={{
                    position: 'absolute',
                    right: 14,
                    bottom: 14,
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: dark ? '#fff' : palette.deep,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="arrow-right" size={17} color={dark ? palette.deep : '#fff'} />
                </View>
              </Press>
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
