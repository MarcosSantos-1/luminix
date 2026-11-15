import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import {
  Animated,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useStore } from '../src/store'
import { fonts, palettes, radius } from '../src/theme'
import { Button, Enter, Icon, Press, Rings, type, type IconName } from '../src/ui'

const slides: { icon: IconName; kicker: string; title: string; body: string; tone: string }[] = [
  {
    icon: 'calendar',
    kicker: 'Seus horários',
    title: 'Marque em segundos, sem trocar mensagens.',
    body: 'Escolha o serviço, o dia e o horário. O espaço confirma e você recebe o aviso.',
    tone: palettes.luminix.deep,
  },
  {
    icon: 'map-pin',
    kicker: 'Seus espaços',
    title: 'Salão, clínica e estúdio em uma conta só.',
    body: 'Encontre o espaço pelo nome ou pelo código e alterne entre eles com um toque.',
    tone: palettes.violeta.deep,
  },
  {
    icon: 'bell',
    kicker: 'Tudo em dia',
    title: 'Lembretes, histórico e promoções do seu espaço.',
    body: 'Acompanhe o que já fez, o que vem pela frente e as condições especiais.',
    tone: palettes.esmeralda.deep,
  },
]

export default function Welcome() {
  const router = useRouter()
  const { finishIntro } = useStore()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const scroll = useRef(new Animated.Value(0)).current
  const pager = useRef<ScrollView>(null)
  const [index, setIndex] = useState(0)
  const last = index === slides.length - 1

  function leave(to: '/cadastro' | '/entrar') {
    finishIntro()
    router.replace(to)
  }

  // The background eases from one slide's tone to the next while the finger drags.
  const backgroundColor = scroll.interpolate({
    inputRange: slides.map((_, position) => position * width),
    outputRange: slides.map((slide) => slide.tone),
  })

  return (
    <Animated.View style={{ flex: 1, backgroundColor }}>
      <Rings />
      <View
        style={{
          paddingTop: insets.top + 14,
          paddingHorizontal: 24,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text
          style={{ fontFamily: fonts.display, fontSize: 22, color: '#fff', letterSpacing: -0.6 }}
        >
          Luminix
        </Text>
        <Press onPress={() => leave('/entrar')} label="Pular apresentação">
          <Text
            style={{
              fontFamily: fonts.bodySemi,
              fontSize: 14,
              color: 'rgba(255,255,255,0.78)',
              padding: 8,
            }}
          >
            Pular
          </Text>
        </Press>
      </View>

      <Animated.ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        // A bounded pager: pages stretch to its height instead of growing the screen.
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ height: '100%' }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scroll } } }], {
          useNativeDriver: false,
          // Also covers the button's programmatic scroll, which ends without a momentum event.
          listener: (event: NativeSyntheticEvent<NativeScrollEvent>) =>
            setIndex(Math.round(event.nativeEvent.contentOffset.x / width)),
        })}
        scrollEventThrottle={16}
      >
        {slides.map((item, position) => {
          const range = [(position - 1) * width, position * width, (position + 1) * width]
          // Icon and text travel at different speeds: a light parallax between pages.
          const iconShift = scroll.interpolate({
            inputRange: range,
            outputRange: [width * 0.5, 0, -width * 0.5],
          })
          const textShift = scroll.interpolate({
            inputRange: range,
            outputRange: [width * 0.18, 0, -width * 0.18],
          })
          const opacity = scroll.interpolate({ inputRange: range, outputRange: [0, 1, 0] })
          return (
            <View
              key={item.kicker}
              style={{
                width,
                justifyContent: 'flex-end',
                padding: 24,
                paddingBottom: 30,
              }}
            >
              <Animated.View
                style={{
                  width: 132,
                  height: 132,
                  borderRadius: 44,
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 44,
                  transform: [{ translateX: iconShift }, { rotate: '-8deg' }],
                }}
              >
                <View
                  style={{
                    width: 84,
                    height: 84,
                    borderRadius: 30,
                    backgroundColor: '#fff',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: [{ rotate: '8deg' }],
                  }}
                >
                  <Icon name={item.icon} size={36} color={item.tone} />
                </View>
              </Animated.View>
              <Animated.View style={{ opacity, transform: [{ translateX: textShift }], gap: 12 }}>
                <Text style={[type.kicker, { color: 'rgba(255,255,255,0.7)' }]}>{item.kicker}</Text>
                <Text style={[type.h1, { color: '#fff', fontSize: 34, lineHeight: 38 }]}>
                  {item.title}
                </Text>
                <Text style={[type.body, { color: 'rgba(255,255,255,0.76)' }]}>{item.body}</Text>
              </Animated.View>
            </View>
          )
        })}
      </Animated.ScrollView>

      <Enter
        delay={250}
        style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 22, gap: 18 }}
      >
        <View
          style={{ flexDirection: 'row', gap: 7 }}
          accessibilityLabel={`Página ${index + 1} de ${slides.length}`}
        >
          {slides.map((slide, position) => {
            const range = [(position - 1) * width, position * width, (position + 1) * width]
            return (
              <Animated.View
                key={slide.kicker}
                style={{
                  height: 7,
                  borderRadius: radius.pill,
                  backgroundColor: '#fff',
                  width: scroll.interpolate({
                    inputRange: range,
                    outputRange: [7, 26, 7],
                    extrapolate: 'clamp',
                  }),
                  opacity: scroll.interpolate({
                    inputRange: range,
                    outputRange: [0.35, 1, 0.35],
                    extrapolate: 'clamp',
                  }),
                }}
              />
            )
          })}
        </View>
        <Button
          label={last ? 'Criar minha conta' : 'Continuar'}
          variant="light"
          icon="arrow-right"
          palette={palettes.luminix}
          onPress={() =>
            last
              ? leave('/cadastro')
              : pager.current?.scrollTo({ x: (index + 1) * width, animated: true })
          }
        />
        <Press onPress={() => leave('/entrar')}>
          <Text
            style={{
              textAlign: 'center',
              fontFamily: fonts.bodySemi,
              fontSize: 14.5,
              color: 'rgba(255,255,255,0.85)',
              paddingVertical: 4,
            }}
          >
            Já tenho conta
          </Text>
        </Press>
      </Enter>
    </Animated.View>
  )
}
