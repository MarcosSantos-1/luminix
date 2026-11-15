import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { loadSpace, type Service } from '../api'
import { useStore } from '../store'
import { colors, paletteFor, radius } from '../theme'
import { Enter, Icon, type, type IconName } from './index'

/** Services of the active space, from the public projection. `null` while loading. */
export function useServices() {
  const { space } = useStore()
  const slug = space?.slug ?? null
  const [result, setResult] = useState<{ slug: string; services: Service[] } | null>(null)
  useEffect(() => {
    if (!slug) return
    let active = true
    void loadSpace(slug).then((found) => {
      if (active) setResult({ slug, services: found?.clinic.services ?? [] })
    })
    return () => {
      active = false
    }
  }, [slug])
  return result && result.slug === slug ? result.services : null
}

/** Scrollable tab page with the title block and room for the floating bar. */
export function TabPage({
  title,
  kicker,
  children,
}: {
  title: string
  kicker?: string
  children: ReactNode
}) {
  const insets = useSafeAreaInsets()
  const { space } = useStore()
  const palette = paletteFor(space?.theme)
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        padding: 20,
        paddingTop: insets.top + 20,
        paddingBottom: insets.bottom + 120,
        gap: 18,
      }}
    >
      <Enter>
        <Text style={[type.small, { color: palette.muted }]}>{kicker ?? space?.name}</Text>
        <Text style={[type.h1, { marginTop: 2 }]}>{title}</Text>
      </Enter>
      {children}
    </ScrollView>
  )
}

/** Honest placeholder for a screen whose data does not exist in the app yet. */
export function ComingSoon({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const { space } = useStore()
  const palette = paletteFor(space?.theme)
  return (
    <Enter
      delay={120}
      style={{
        padding: 26,
        borderRadius: radius.card,
        backgroundColor: colors.card,
        alignItems: 'center',
        gap: 10,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 24,
          backgroundColor: palette.light,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={26} color={palette.deep} />
      </View>
      <Text style={[type.h2, { fontSize: 19, textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.body, { textAlign: 'center', color: palette.muted }]}>{body}</Text>
    </Enter>
  )
}
