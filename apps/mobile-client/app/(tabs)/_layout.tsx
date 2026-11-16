import { recordState } from '@luminix/contracts/anamnesis'
import { Redirect } from 'expo-router'
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs'
import { useEffect, useRef } from 'react'
import { Animated, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useStore } from '../../src/store'
import { colors, fonts, paletteFor, shadow } from '../../src/theme'
import { Icon, Press, type IconName } from '../../src/ui'

const tabs: Record<string, { label: string; icon: IconName }> = {
  historico: { label: 'Histórico', icon: 'clock' },
  servicos: { label: 'Serviços', icon: 'grid' },
  index: { label: 'Início', icon: 'home' },
  agenda: { label: 'Agenda', icon: 'calendar' },
  perfil: { label: 'Perfil', icon: 'user' },
}

/** Side tab: only the current one spends width on its label. */
function TabItem({
  name,
  focused,
  onPress,
  tint,
}: {
  name: string
  focused: boolean
  onPress: () => void
  tint: { deep: string; light: string }
}) {
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current
  useEffect(() => {
    Animated.spring(progress, {
      toValue: focused ? 1 : 0,
      useNativeDriver: false,
      speed: 18,
      bounciness: 6,
    }).start()
  }, [focused, progress])
  const { label, icon } = tabs[name]
  return (
    <Press onPress={onPress} label={label} selected={focused}>
      <Animated.View
        style={{
          height: 46,
          borderRadius: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          overflow: 'hidden',
          paddingHorizontal: 13,
          backgroundColor: progress.interpolate({
            inputRange: [0, 1],
            outputRange: ['rgba(255,255,255,0)', tint.light],
          }),
        }}
      >
        <Icon name={icon} size={20} color={focused ? tint.deep : '#a2a2ae'} />
        <Animated.View
          style={{
            maxWidth: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 90] }),
            opacity: progress,
          }}
        >
          <Text
            numberOfLines={1}
            style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: tint.deep }}
          >
            {label}
          </Text>
        </Animated.View>
      </Animated.View>
    </Press>
  )
}

function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const { space } = useStore()
  const palette = paletteFor(space?.summary.theme)
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: insets.bottom + 12,
        alignItems: 'center',
      }}
    >
      <View
        style={[
          {
            width: '92%',
            maxWidth: 420,
            height: 68,
            borderRadius: 26,
            paddingHorizontal: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(255,255,255,0.97)',
            borderWidth: 1,
            borderColor: colors.line,
          },
          shadow,
        ]}
      >
        {state.routes.map((route, index) => {
          if (!tabs[route.name]) return null
          const focused = state.index === index
          const go = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            })
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name)
          }
          if (route.name === 'index')
            return (
              <Press
                key={route.key}
                onPress={go}
                label="Início"
                selected={focused}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: palette.deep,
                  borderWidth: 4,
                  borderColor: palette.light,
                }}
              >
                <Icon name="home" size={21} color="#fff" />
              </Press>
            )
          return (
            <TabItem
              key={route.key}
              name={route.name}
              focused={focused}
              onPress={go}
              tint={palette}
            />
          )
        })}
      </View>
    </View>
  )
}

export default function TabsLayout() {
  const { ready, account, space, anamnesis } = useStore()
  // Deep links and reloads land here directly: anything missing goes back through the gate.
  if (ready && (!account || !space || recordState(anamnesis, space.requiredLevel) !== 'ok'))
    return <Redirect href="/" />
  return (
    <Tabs
      initialRouteName="index"
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tabs.Screen name="historico" />
      <Tabs.Screen name="servicos" />
      <Tabs.Screen name="index" />
      <Tabs.Screen name="agenda" />
      <Tabs.Screen name="perfil" />
    </Tabs>
  )
}
