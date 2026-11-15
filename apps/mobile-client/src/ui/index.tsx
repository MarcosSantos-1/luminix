import { Feather } from '@expo/vector-icons'
import { useEffect, useRef, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import type { SpaceSummary } from '../api'
import { colors, fonts, paletteFor, radius, type Palette } from '../theme'

export type IconName = ComponentProps<typeof Feather>['name']
export const Icon = Feather

// The web build has no native driver; everything here animates transform/opacity only.
const native = true

export const type = StyleSheet.create({
  h1: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.7,
    color: colors.ink,
  },
  h2: {
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.4,
    color: colors.ink,
  },
  body: { fontFamily: fonts.body, fontSize: 15.5, lineHeight: 22, color: colors.ink },
  strong: { fontFamily: fonts.bodySemi, fontSize: 15.5, lineHeight: 21, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  kicker: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
})

/** Fades and lifts its children in; `delay` staggers a screen's blocks. */
export function Enter({
  children,
  delay = 0,
  from = 18,
  style,
}: {
  children: ReactNode
  delay?: number
  from?: number
  style?: StyleProp<ViewStyle>
}) {
  const progress = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 520,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: native,
    }).start()
  }, [progress, delay])
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  )
}

/** Pressable that gives under the finger. */
export function Press({
  children,
  onPress,
  style,
  disabled,
  label,
  selected,
}: {
  children: ReactNode
  onPress?: () => void
  style?: StyleProp<ViewStyle>
  disabled?: boolean
  label?: string
  selected?: boolean
}) {
  const scale = useRef(new Animated.Value(1)).current
  const to = (value: number) =>
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: native,
      speed: 40,
      bounciness: 6,
    }).start()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => to(0.96)}
      onPressOut={() => to(1)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }, disabled && { opacity: 0.5 }]}>
        {children}
      </Animated.View>
    </Pressable>
  )
}

export function Button({
  label,
  onPress,
  palette = paletteFor(null),
  variant = 'solid',
  icon,
  disabled,
}: {
  label: string
  onPress?: () => void
  palette?: Palette
  variant?: 'solid' | 'ghost' | 'light'
  icon?: IconName
  disabled?: boolean
}) {
  const background =
    variant === 'solid' ? palette.deep : variant === 'light' ? '#ffffff' : 'transparent'
  const color = variant === 'solid' ? '#ffffff' : variant === 'light' ? palette.deep : colors.ink
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        { backgroundColor: background },
        variant === 'ghost' && { borderWidth: 1.5, borderColor: colors.line },
      ]}
    >
      <Text style={[styles.buttonText, { color }]}>{label}</Text>
      {icon && <Icon name={icon} size={18} color={color} />}
    </Press>
  )
}

export function Field({
  label,
  hint,
  palette = paletteFor(null),
  style,
  right,
  ...input
}: TextInputProps & {
  label: string
  hint?: string
  palette?: Palette
  style?: StyleProp<TextStyle>
  right?: ReactNode
}) {
  const [focused, setFocused] = useState(false)
  return (
    <View style={{ gap: 7 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, focused && { borderColor: palette.accent }]}>
        <TextInput
          {...input}
          accessibilityLabel={label}
          placeholderTextColor="#a2a2ae"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, webInputReset, style]}
        />
        {right}
      </View>
      {hint ? <Text style={[type.small, { color: palette.muted }]}>{hint}</Text> : null}
    </View>
  )
}

/** Asymmetric ring work for the dark blocks. Decorative only. */
export function Rings({ color = '#ffffff' }: { color?: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {[260, 340, 420, 500, 580].map((size, index) => (
        <View
          key={size}
          style={{
            position: 'absolute',
            right: -size * 0.42,
            top: -size * 0.3 + index * 6,
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1,
            borderColor: color,
            opacity: 0.13 - index * 0.015,
          }}
        />
      ))}
    </View>
  )
}

export function SpaceLogo({
  space,
  size = 48,
  inverted,
}: {
  space: SpaceSummary
  size?: number
  inverted?: boolean
}) {
  const palette = paletteFor(space.theme)
  const initials = space.name
    .split(/\s+/)
    .filter((part) => /\p{L}/u.test(part))
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: inverted ? '#ffffff' : palette.deep,
      }}
    >
      {space.logoUrl ? (
        <Image source={{ uri: space.logoUrl }} style={{ width: size, height: size }} />
      ) : (
        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: size * 0.36,
            color: inverted ? palette.deep : '#ffffff',
          }}
        >
          {initials}
        </Text>
      )}
    </View>
  )
}

export function ErrorText({ children }: { children: string }) {
  return children ? (
    <Text
      accessibilityRole="alert"
      style={[type.small, { color: colors.danger, fontFamily: fonts.bodySemi }]}
    >
      {children}
    </Text>
  ) : null
}

// The browser draws its own focus ring; the field border already shows focus.
const webInputReset = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    borderRadius: radius.button,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: { fontFamily: fonts.bodySemi, fontSize: 16 },
  label: { fontFamily: fonts.bodySemi, fontSize: 13.5, color: colors.ink },
  field: {
    minHeight: 54,
    borderRadius: radius.field,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 6,
  },
  input: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: 15,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
  },
})
