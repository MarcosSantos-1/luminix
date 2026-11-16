import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isCompleteSpaceCode, maskSpaceCode, searchSpaces, type SpaceSummary } from '../src/api'
import { useStore } from '../src/store'
import { colors, fonts, palettes, radius, shadow } from '../src/theme'
import { Enter, Field, Icon, Press, SpaceLogo, type } from '../src/ui'

type Mode = 'code' | 'name'

function SpaceCard({
  space,
  onPress,
  current,
  onRemove,
}: {
  space: SpaceSummary
  onPress: () => void
  current?: boolean
  onRemove?: () => void
}) {
  const card = (
    <Press
      onPress={onPress}
      label={space.name}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: 14,
          borderRadius: 22,
          backgroundColor: colors.card,
        },
        shadow,
      ]}
    >
      <SpaceLogo space={space} size={52} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.strong} numberOfLines={1}>
          {space.name}
        </Text>
        <Text style={[type.small, { color: palettes.luminix.muted }]} numberOfLines={1}>
          {[space.category, space.city].filter(Boolean).join(' · ') || 'Espaço Luminix'}
        </Text>
      </View>
      {current ? (
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: radius.pill,
            backgroundColor: colors.okBg,
          }}
        >
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11.5, color: colors.ok }}>
            Atual
          </Text>
        </View>
      ) : (
        <Icon name="chevron-right" size={19} color={palettes.luminix.muted} />
      )}
    </Press>
  )
  if (!onRemove) return card
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1 }}>{card}</View>
      <Press
        onPress={onRemove}
        label={`Remover ${space.name} da lista`}
        style={{
          width: 42,
          height: 42,
          borderRadius: 15,
          backgroundColor: colors.card,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="trash-2" size={17} color={palettes.luminix.muted} />
      </Press>
    </View>
  )
}

export default function FindSpace() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { account, space: active, signOut, leaveSpace } = useStore()
  const [mode, setMode] = useState<Mode>('code')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [results, setResults] = useState<{ query: string; spaces: SpaceSummary[] | null } | null>(
    null,
  )
  const palette = palettes.luminix
  const linked = (account?.spaces ?? []).map((item) => item.summary)
  const firstName = account?.name.split(/\s+/)[0] ?? ''

  // A code is searched only when complete; a name after a short pause in typing.
  const query =
    mode === 'code'
      ? isCompleteSpaceCode(code)
        ? code
        : ''
      : name.trim().length >= 3
        ? name.trim()
        : ''
  useEffect(() => {
    if (!query) return
    const controller = new AbortController()
    const timer = setTimeout(
      () => {
        void searchSpaces(query, controller.signal).then((spaces) => {
          if (!controller.signal.aborted) setResults({ query, spaces })
        })
      },
      mode === 'code' ? 0 : 350,
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, mode])

  const current = results && results.query === query ? results : null
  const open = (space: SpaceSummary) => router.push(`/espaco/${space.slug}`)

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        padding: 24,
        paddingTop: insets.top + 18,
        paddingBottom: insets.bottom + 30,
        gap: 18,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        {linked.length > 0 && active ? (
          <Press
            onPress={() => router.replace('/(tabs)')}
            label="Voltar"
            style={{
              width: 42,
              height: 42,
              borderRadius: 15,
              backgroundColor: colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="arrow-left" size={19} color={colors.ink} />
          </Press>
        ) : (
          <Text
            style={{
              fontFamily: fonts.display,
              fontSize: 22,
              letterSpacing: -0.6,
              color: colors.ink,
            }}
          >
            Luminix
          </Text>
        )}
        <Press
          onPress={() => {
            signOut()
            router.replace('/')
          }}
        >
          <Text
            style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: palette.muted, padding: 8 }}
          >
            Sair
          </Text>
        </Press>
      </View>

      <Enter>
        <Text style={type.h1}>
          {linked.length ? 'Seus espaços' : `${firstName}, qual é o seu espaço?`}
        </Text>
        <Text style={[type.body, { color: palette.muted, marginTop: 10 }]}>
          {linked.length
            ? 'Toque para entrar ou adicione outro espaço.'
            : 'Use o código que o espaço passou para você ou busque pelo nome.'}
        </Text>
      </Enter>

      {linked.length > 0 && (
        <Enter delay={100} style={{ gap: 10 }}>
          {linked.map((space) => (
            <SpaceCard
              key={space.slug}
              space={space}
              current={space.slug === active?.summary.slug}
              onRemove={() => void leaveSpace(space.slug)}
              onPress={() => open(space)}
            />
          ))}
          <Text style={[type.h2, { marginTop: 14 }]}>Adicionar espaço</Text>
        </Enter>
      )}

      <Enter delay={160} style={{ gap: 16 }}>
        <View
          style={{ flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: '#e6e6ec' }}
        >
          {(
            [
              ['code', 'Tenho um código'],
              ['name', 'Buscar pelo nome'],
            ] as const
          ).map(([value, label]) => (
            <View key={value} style={{ flex: 1 }}>
              <Press
                onPress={() => setMode(value)}
                selected={mode === value}
                style={[
                  {
                    minHeight: 44,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                  mode === value && { backgroundColor: colors.card },
                ]}
              >
                <Text
                  style={{
                    fontFamily: fonts.bodySemi,
                    fontSize: 14,
                    color: mode === value ? colors.ink : palette.muted,
                  }}
                >
                  {label}
                </Text>
              </Press>
            </View>
          ))}
        </View>

        {mode === 'code' ? (
          <Field
            label="Código do espaço"
            value={code}
            onChangeText={(text) => setCode(maskSpaceCode(text))}
            placeholder="AA-0000"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            hint="Duas letras e quatro números. Está no site e nos convites do espaço."
            style={{
              fontFamily: fonts.display,
              fontSize: 26,
              letterSpacing: 6,
              textAlign: 'center',
            }}
          />
        ) : (
          <Field
            label="Nome do espaço"
            value={name}
            onChangeText={setName}
            placeholder="Ex.: Espaço Vanessa"
            autoCorrect={false}
            hint="Escreva o nome, ou parte dele, como aparece no site do espaço."
            right={
              <View style={{ paddingRight: 10 }}>
                <Icon name="search" size={19} color={palette.muted} />
              </View>
            }
          />
        )}
      </Enter>

      {query && !current ? (
        <View
          style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 6 }}
          accessibilityRole="progressbar"
        >
          <ActivityIndicator color={palette.deep} />
          <Text style={[type.small, { color: palette.muted }]}>Procurando o espaço…</Text>
        </View>
      ) : null}

      {current?.spaces?.length ? (
        <View style={{ gap: 10 }}>
          {current.spaces.map((space, index) => (
            <Enter key={space.slug} delay={index * 70}>
              <SpaceCard space={space} onPress={() => open(space)} />
            </Enter>
          ))}
        </View>
      ) : null}

      {current && !current.spaces?.length ? (
        <Enter
          style={{
            padding: 22,
            borderRadius: radius.card,
            backgroundColor: colors.card,
            gap: 6,
            alignItems: 'center',
          }}
        >
          <Text style={[type.strong, { fontFamily: fonts.displayMedium, fontSize: 17 }]}>
            {current.spaces ? 'Nenhum espaço encontrado' : 'Sem conexão com o Luminix'}
          </Text>
          <Text style={[type.small, { color: palette.muted, textAlign: 'center' }]}>
            {current.spaces
              ? 'Confira o código ou o nome com a equipe do espaço.'
              : 'Verifique sua internet e tente de novo.'}
          </Text>
        </Enter>
      ) : null}

      {!query && linked.length === 0 ? (
        <Press
          onPress={() => {
            setMode('name')
            setName('demo')
          }}
        >
          <Text
            style={{
              fontFamily: fonts.bodySemi,
              fontSize: 14,
              color: palette.accent,
              paddingVertical: 6,
            }}
          >
            Só quero conhecer: ver espaços de demonstração
          </Text>
        </Press>
      ) : null}
    </ScrollView>
  )
}
