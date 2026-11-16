import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Image, RefreshControl, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { loadSpace, type Service } from '../api'
import { initials } from '../format'
import { displayStatus, useStore, type Appointment } from '../store'
import { colors, fonts, paletteFor, radius } from '../theme'
import { Enter, Icon, type, type IconName } from './index'

/** Services of the active space, from the public projection. `null` while loading. */
export function useServices() {
  const { space } = useStore()
  const slug = space?.summary.slug ?? null
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

export function usePalette() {
  const { space } = useStore()
  return paletteFor(space?.summary.theme)
}

/** Scrollable tab page with the title block, pull to refresh and room for the floating bar. */
export function TabPage({
  title,
  kicker,
  action,
  children,
}: {
  title: string
  kicker?: string
  action?: ReactNode
  children: ReactNode
}) {
  const insets = useSafeAreaInsets()
  const { space, refresh, refreshing } = useStore()
  const palette = paletteFor(space?.summary.theme)
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        padding: 20,
        paddingTop: insets.top + 20,
        paddingBottom: insets.bottom + 120,
        gap: 18,
      }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.deep} />
      }
    >
      <Enter style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={[type.small, { color: palette.muted }]}>
            {kicker ?? space?.summary.name}
          </Text>
          <Text style={[type.h1, { marginTop: 2 }]}>{title}</Text>
        </View>
        {action}
      </Enter>
      {children}
    </ScrollView>
  )
}

/** Friendly empty state. */
export function EmptyState({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const palette = usePalette()
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

export function Avatar({
  name,
  photo,
  size = 44,
}: {
  name: string
  photo?: string | null
  size?: number
}) {
  const palette = usePalette()
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        backgroundColor: palette.light,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {photo ? (
        <Image source={{ uri: photo }} style={{ width: size, height: size }} />
      ) : (
        <Text style={{ fontFamily: fonts.display, fontSize: size * 0.36, color: palette.deep }}>
          {initials(name)}
        </Text>
      )}
    </View>
  )
}

const statusText = {
  requested: 'A confirmar',
  confirmed: 'Confirmado',
  done: 'Realizado',
  cancelled: 'Cancelado',
} as const

const statusColors = {
  requested: { bg: '#fdf1d7', fg: '#7a5200' },
  confirmed: { bg: '#dff3e6', fg: '#14613a' },
  done: { bg: '#ececf1', fg: '#3d3d47' },
  cancelled: { bg: '#ececf1', fg: '#5b5b66' },
}

export function StatusBadge({ appointment }: { appointment: Appointment }) {
  const status = displayStatus(appointment)
  const color = statusColors[status]
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: radius.pill,
        backgroundColor: color.bg,
      }}
    >
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11.5, color: color.fg }}>
        {statusText[status]}
      </Text>
    </View>
  )
}

export const money = (cents: number) =>
  `R$ ${(cents / 100)
    .toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
