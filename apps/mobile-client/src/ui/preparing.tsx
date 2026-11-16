import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import type { SpaceSummary } from '../api'
import { paletteFor, radius } from '../theme'
import { Rings, SpaceLogo, type } from './index'

/** Covers the screen while the space area is assembled, then calls `onDone`. */
export function Preparing({ space, onDone }: { space: SpaceSummary; onDone: () => void }) {
  const palette = paletteFor(space.theme)
  const fade = useRef(new Animated.Value(0)).current
  const bar = useRef(new Animated.Value(0)).current
  const breathe = useRef(new Animated.Value(0)).current
  // The caller's callback changes every render; the animation must start only once.
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }).start()
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    Animated.timing(bar, {
      toValue: 1,
      duration: 2000,
      easing: Easing.bezier(0.3, 0.6, 0.2, 1),
      useNativeDriver: true,
    }).start(({ finished }) => finished && done.current())
    return () => loop.stop()
  }, [fade, bar, breathe])
  return (
    <Animated.View
      accessibilityRole="progressbar"
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: palette.deep,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          opacity: fade,
        },
      ]}
    >
      <Rings />
      <Animated.View
        style={{
          transform: [
            { scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
          ],
        }}
      >
        <SpaceLogo space={space} size={88} inverted />
      </Animated.View>
      <Text
        style={[
          type.h2,
          { color: '#fff', fontSize: 24, textAlign: 'center', paddingHorizontal: 30 },
        ]}
      >
        {space.name}
      </Text>
      <Text style={[type.body, { color: 'rgba(255,255,255,0.72)' }]}>Preparando o seu acesso…</Text>
      <View
        style={{
          width: 180,
          height: 4,
          borderRadius: radius.pill,
          overflow: 'hidden',
          backgroundColor: 'rgba(255,255,255,0.18)',
        }}
      >
        <Animated.View
          style={{
            width: 180,
            height: 4,
            borderRadius: radius.pill,
            backgroundColor: '#fff',
            transform: [
              { translateX: bar.interpolate({ inputRange: [0, 1], outputRange: [-176, 0] }) },
            ],
          }}
        />
      </View>
    </Animated.View>
  )
}
