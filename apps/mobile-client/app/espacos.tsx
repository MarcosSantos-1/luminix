import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { recordState } from '@luminix/contracts/anamnesis'
import { isCompleteSpaceCode, maskSpaceCode, searchSpaces, type SpaceSummary } from '../src/api'
import { firstName } from '../src/format'
import { useStore } from '../src/store'
import { colors, fonts, palettes, radius, shadow } from '../src/theme'
import { Enter, Field, Icon, Press, SpaceLogo, type, type IconName } from '../src/ui'

/** One window at a time: your spaces → how to find → search. Confirmation is its own screen. */
type View_ = 'list' | 'how' | 'search'
type How = 'code' | 'name'

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
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1 }}>
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
      </View>
      {onRemove && (
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
      )}
    </View>
  )
}

function ChoiceCard({
  icon,
  title,
  body,
  onPress,
}: {
  icon: IconName
  title: string
  body: string
  onPress: () => void
}) {
  const palette = palettes.luminix
  return (
    <Press
      onPress={onPress}
      label={title}
      style={[
        {
          padding: 18,
          borderRadius: 22,
          backgroundColor: colors.card,
          gap: 6,
          borderWidth: 1.5,
          borderColor: colors.line,
        },
        shadow,
      ]}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 16,
          backgroundColor: palette.light,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 4,
        }}
      >
        <Icon name={icon} size={21} color={palette.deep} />
      </View>
      <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.ink }}>{title}</Text>
      <Text style={[type.small, { color: palette.muted }]}>{body}</Text>
    </Press>
  )
}

export default function FindSpace() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { account, space: active, signOut, leaveSpace, enterSpace } = useStore()
  const linked = account?.spaces ?? []
  const [view, setView] = useState<View_>(linked.length ? 'list' : 'how')
  const [how, setHow] = useState<How>('code')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [results, setResults] = useState<{ query: string; spaces: SpaceSummary[] | null } | null>(
    null,
  )
  const palette = palettes.luminix

  // A code is searched only when complete; a name after a short pause in typing.
  const query =
    view !== 'search'
      ? ''
      : how === 'code'
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
      how === 'code' ? 0 : 350,
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, how])

  const current = results && results.query === query ? results : null

  /** Linked space: straight in when its record is enough, else through the record. */
  function open(slug: string) {
    const space = linked.find((item) => item.summary.slug === slug)
    if (!space || !account) return
    enterSpace(slug)
    const record = space.shareAnamnesis ? account.anamnesis : space.ownAnamnesis
    if (recordState(record, space.requiredLevel) === 'ok') router.replace('/(tabs)')
    else router.push(`/anamnese?espaco=${slug}&entrar=1`)
  }

  function back() {
    if (view === 'search') return setView('how')
    if (view === 'how' && linked.length) return setView('list')
    if (active) router.replace('/(tabs)')
  }

  const canGoBack = view !== 'list' ? view === 'search' || linked.length > 0 : Boolean(active)

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
        {canGoBack ? (
          <Press
            onPress={back}
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

      <Enter key={view} style={{ gap: 18 }}>
        {view === 'list' && (
          <>
            <Text style={type.h1}>Seus espaços</Text>
            <Text style={[type.body, { color: palette.muted }]}>
              Toque para entrar. Horários e histórico são separados por espaço.
            </Text>
            {linked.map((item) => (
              <SpaceCard
                key={item.summary.slug}
                space={item.summary}
                current={item.summary.slug === active?.summary.slug}
                onPress={() => open(item.summary.slug)}
                onRemove={() => void leaveSpace(item.summary.slug)}
              />
            ))}
            <Press
              onPress={() => setView('how')}
              label="Acessar outro espaço"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                padding: 14,
                borderRadius: 22,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: palette.accent,
              }}
            >
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  backgroundColor: palette.deep,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="plus" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.strong}>Acessar outro espaço</Text>
                <Text style={[type.small, { color: palette.muted }]}>Pelo código ou pelo nome</Text>
              </View>
            </Press>
          </>
        )}

        {view === 'how' && (
          <>
            <Text style={type.h1}>
              {linked.length
                ? 'Como quer encontrar?'
                : `${firstName(account?.name ?? '')}, qual é o seu espaço?`}
            </Text>
            <Text style={[type.body, { color: palette.muted }]}>
              O espaço passou um código? É o caminho mais rápido.
            </Text>
            <ChoiceCard
              icon="hash"
              title="Tenho um código"
              body="Duas letras e quatro números, como KW-4374"
              onPress={() => {
                setHow('code')
                setCode('')
                setView('search')
              }}
            />
            <ChoiceCard
              icon="search"
              title="Buscar pelo nome"
              body="Do jeito que aparece no site do espaço"
              onPress={() => {
                setHow('name')
                setName('')
                setView('search')
              }}
            />
          </>
        )}

        {view === 'search' && (
          <>
            <Text style={type.h1}>
              {how === 'code' ? 'Digite o código' : 'Qual é o nome do espaço?'}
            </Text>
            {how === 'code' ? (
              <Field
                label="Código do espaço"
                value={code}
                onChangeText={(text) => setCode(maskSpaceCode(text))}
                placeholder="AA-0000"
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
                maxLength={7}
                style={{
                  fontFamily: fonts.display,
                  fontSize: 28,
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
                autoFocus
                right={
                  <View style={{ paddingRight: 10 }}>
                    <Icon name="search" size={19} color={palette.muted} />
                  </View>
                }
              />
            )}
            {query && !current ? (
              <View
                style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 6 }}
              >
                <ActivityIndicator color={palette.deep} />
                <Text style={[type.small, { color: palette.muted }]}>Procurando o espaço…</Text>
              </View>
            ) : null}
            {current?.spaces?.map((space, index) => (
              <Enter key={space.slug} delay={index * 70}>
                <SpaceCard space={space} onPress={() => router.push(`/espaco/${space.slug}`)} />
              </Enter>
            ))}
            {current && !current.spaces?.length ? (
              <View
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
                    ? how === 'code'
                      ? 'Confira o código com a equipe.'
                      : 'Tente o nome completo, como aparece no site do espaço.'
                    : 'Verifique sua internet e tente de novo.'}
                </Text>
              </View>
            ) : null}
            {how === 'name' && !query ? (
              <Press onPress={() => setName('demo')}>
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
          </>
        )}
      </Enter>
    </ScrollView>
  )
}
