import { useLocalSearchParams, useRouter } from 'expo-router'
import { createElement, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { loadSpace, type SpaceSummary } from '../../src/api'
import { useStore } from '../../src/store'
import { colors, fonts, paletteFor, radius } from '../../src/theme'
import { Button, Enter, Icon, Press, SpaceLogo, type } from '../../src/ui'
import { Preparing } from '../../src/ui/preparing'

const mapsUrl = (space: SpaceSummary) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${space.name} ${space.mapQuery ?? ''}`)}`

/**
 * Location block. The web build embeds the Google minimap; on the phone it is a tappable
 * preview that opens the maps app (an in-app map needs a native map dependency, still pending).
 */
function SpaceMap({ space }: { space: SpaceSummary }) {
  const palette = paletteFor(space.theme)
  const [loaded, setLoaded] = useState(false)
  const drop = useRef(new Animated.Value(0)).current
  const pulse = useRef(new Animated.Value(0)).current
  const embedded = Platform.OS === 'web'

  useEffect(() => {
    Animated.spring(drop, { toValue: 1, useNativeDriver: true, bounciness: 14, speed: 6 }).start()
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [drop, pulse])

  if (!space.mapQuery) return null
  const preview = (
    <View
      style={[
        StyleSheet.absoluteFill,
        { alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: palette.light },
      ]}
    >
      {[0.25, 0.5, 0.75].map((position) => (
        <View
          key={`h${position}`}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${position * 100}%`,
            height: 1,
            backgroundColor: palette.accent,
            opacity: 0.14,
          }}
        />
      ))}
      {[0.2, 0.45, 0.7, 0.9].map((position) => (
        <View
          key={`v${position}`}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${position * 100}%`,
            width: 1,
            backgroundColor: palette.accent,
            opacity: 0.14,
          }}
        />
      ))}
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={{
            position: 'absolute',
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: palette.accent,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
            transform: [
              { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) },
            ],
          }}
        />
        <Animated.View
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: palette.deep,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: drop,
            transform: [
              { translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-70, 0] }) },
            ],
          }}
        >
          <Icon name="map-pin" size={21} color="#fff" />
        </Animated.View>
      </View>
      <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13.5, color: palette.deep }}>
        {embedded ? `Localizando ${space.name}…` : 'Toque para abrir no mapa'}
      </Text>
    </View>
  )

  return (
    <View
      style={{ height: 210, borderRadius: 22, overflow: 'hidden', backgroundColor: palette.light }}
    >
      {embedded ? (
        <>
          {createElement('iframe', {
            title: `Mapa da localização de ${space.name}`,
            src: `https://maps.google.com/maps?q=${encodeURIComponent(space.mapQuery)}&z=16&output=embed`,
            referrerPolicy: 'no-referrer',
            onLoad: () => setLoaded(true),
            style: { width: '100%', height: '100%', border: 0 },
          })}
          {!loaded && preview}
        </>
      ) : (
        <Press
          onPress={() => void Linking.openURL(mapsUrl(space))}
          label="Abrir a localização no mapa"
          style={{ height: 210 }}
        >
          {preview}
        </Press>
      )}
    </View>
  )
}

export default function SpaceConfirm() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const { account, enterSpace, joinSpace } = useStore()
  const [state, setState] = useState<{ slug: string; space: SpaceSummary | null } | null>(null)
  const [entering, setEntering] = useState(false)
  const [share, setShare] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void loadSpace(slug).then((found) => {
      if (active) setState({ slug, space: found?.summary ?? null })
    })
    return () => {
      active = false
    }
  }, [slug])

  const space = state?.slug === slug ? state.space : undefined
  const finish = useRef(() => {})
  finish.current = () => {
    router.dismissAll()
    router.replace('/(tabs)')
  }

  async function enter() {
    if (!space) return
    const known = account?.spaces.find((item) => item.summary.slug === space.slug)
    if (known) {
      enterSpace(space.slug)
      // Linked before without a record of its own: it still needs one.
      if (!known.shareAnamnesis && !known.ownAnamnesis)
        return router.replace(`/anamnese?espaco=${space.slug}`)
      return setEntering(true)
    }
    setBusy(true)
    const failure = await joinSpace(space, share)
    setBusy(false)
    if (failure) return setError(failure)
    if (!share) return router.replace(`/anamnese?espaco=${space.slug}`)
    setEntering(true)
  }

  if (space === undefined)
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator color={colors.ink} />
      </View>
    )

  if (!space)
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          padding: 30,
          backgroundColor: colors.bg,
        }}
      >
        <Text style={[type.h2, { textAlign: 'center' }]}>Não foi possível abrir este espaço</Text>
        <Text style={[type.body, { textAlign: 'center', color: paletteFor(null).muted }]}>
          Verifique sua conexão ou confira o código com a equipe.
        </Text>
        <Button label="Voltar" variant="ghost" onPress={() => router.back()} />
      </View>
    )

  const palette = paletteFor(space.theme)
  const known = account?.spaces.some((item) => item.summary.slug === space.slug)
  const location = [space.address, space.city].filter(Boolean).join(' · ')

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingTop: Platform.OS === 'ios' ? 20 : insets.top + 16,
          paddingBottom: insets.bottom + 24,
          gap: 16,
        }}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text style={type.h2}>É este o espaço?</Text>
          <Press
            onPress={() => router.back()}
            label="Fechar"
            style={{
              width: 40,
              height: 40,
              borderRadius: 14,
              backgroundColor: colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="x" size={18} color={colors.ink} />
          </Press>
        </View>

        <Enter>
          <SpaceMap space={space} />
        </Enter>

        <Enter
          delay={120}
          style={{ backgroundColor: colors.card, borderRadius: radius.card, padding: 18, gap: 14 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <SpaceLogo space={space} size={62} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[type.h2, { fontSize: 21 }]}>{space.name}</Text>
              <Text style={[type.small, { color: palette.muted }]}>
                {[space.category, space.code && `Código ${space.code}`].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
          {location ? (
            <View
              style={{
                flexDirection: 'row',
                gap: 10,
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: colors.line,
              }}
            >
              <Icon name="map-pin" size={17} color={palette.accent} />
              <Text style={[type.body, { flex: 1, color: palette.muted }]}>{location}</Text>
            </View>
          ) : null}
          {space.mapQuery ? (
            <Press
              onPress={() => void Linking.openURL(mapsUrl(space))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Text style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: palette.accent }}>
                Como chegar
              </Text>
              <Icon name="arrow-up-right" size={15} color={palette.accent} />
            </Press>
          ) : null}
          {space.demo ? (
            <Text style={[type.small, { color: palette.muted }]}>
              Espaço de demonstração, com dados e endereço de exemplo.
            </Text>
          ) : null}
        </Enter>

        <Enter delay={220}>
          {!known && (
            <Press
              onPress={() => setShare(!share)}
              selected={share}
              style={{
                flexDirection: 'row',
                gap: 12,
                alignItems: 'flex-start',
                padding: 16,
                borderRadius: 20,
                backgroundColor: colors.card,
                borderWidth: 1.5,
                borderColor: share ? palette.deep : colors.line,
                marginBottom: 14,
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: share ? 0 : 1.5,
                  borderColor: colors.line,
                  backgroundColor: share ? palette.deep : colors.card,
                }}
              >
                {share && <Icon name="check" size={15} color="#fff" />}
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={type.strong}>Permitir que {space.name} use minha ficha</Text>
                <Text style={[type.small, { color: palette.muted }]}>
                  {share
                    ? 'A equipe verá a ficha e a foto que você já preencheu.'
                    : 'Sem a permissão, você preenche uma ficha só para este espaço.'}
                </Text>
              </View>
            </Press>
          )}
          {error ? (
            <Text style={[type.small, { color: colors.danger, marginBottom: 10 }]}>{error}</Text>
          ) : null}
          <Button
            label={
              busy
                ? 'Entrando…'
                : known || share
                  ? 'Entrar neste espaço'
                  : 'Preencher ficha e entrar'
            }
            icon="arrow-right"
            palette={palette}
            disabled={busy || space.demo}
            onPress={() => void enter()}
          />
          {space.demo ? (
            <Text
              style={[type.small, { color: palette.muted, textAlign: 'center', marginTop: 10 }]}
            >
              Espaços de demonstração servem só para conhecer: não dá para agendar neles.
            </Text>
          ) : null}
        </Enter>
      </ScrollView>
      {entering && <Preparing space={space} onDone={() => finish.current()} />}
    </View>
  )
}
