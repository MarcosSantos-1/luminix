import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { durationLabel, priceLabel } from '../src/api'
import { addDays, dateLabel, dayKey, weekdayShort } from '../src/format'
import { useStore, type Availability, type PaymentMethod } from '../src/store'
import { colors, fonts, radius, shadow } from '../src/theme'
import { Button, Enter, Icon, Press, Rings, type, type IconName } from '../src/ui'
import { Avatar, money, usePalette, useServices } from '../src/ui/space'

/** "" = no preference: the space gives the time to the first professional free. */
const ANY = ''

const methods: { value: PaymentMethod; label: string; hint: string; icon: IconName }[] = [
  { value: 'local', label: 'Pagar no espaço', hint: 'No dia do atendimento', icon: 'home' },
  { value: 'pix', label: 'Pix', hint: 'Pagamento simulado', icon: 'zap' },
  { value: 'card', label: 'Cartão', hint: 'Pagamento simulado', icon: 'credit-card' },
]

function StepTitle({ index, children }: { index: number; children: string }) {
  const palette = usePalette()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: palette.deep,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: '#fff' }}>{index}</Text>
      </View>
      <Text style={[type.h2, { fontSize: 18 }]}>{children}</Text>
    </View>
  )
}

/** Success stamp: the check pops in, then the text rises. */
function Done({
  title,
  body,
  onAgenda,
  onHome,
}: {
  title: string
  body: string
  onAgenda: () => void
  onHome: () => void
}) {
  const palette = usePalette()
  const pop = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, bounciness: 14, speed: 8 }).start()
  }, [pop])
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 30,
        gap: 16,
        backgroundColor: colors.bg,
      }}
    >
      <Animated.View
        style={{
          width: 92,
          height: 92,
          borderRadius: 46,
          backgroundColor: palette.deep,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: pop }],
        }}
      >
        <Icon name="check" size={40} color="#fff" />
      </Animated.View>
      <Enter delay={200} style={{ alignItems: 'center', gap: 8 }}>
        <Text style={[type.h1, { textAlign: 'center' }]}>{title}</Text>
        <Text style={[type.body, { textAlign: 'center', color: palette.muted }]}>{body}</Text>
      </Enter>
      <Enter delay={320} style={{ alignSelf: 'stretch', gap: 10, marginTop: 10 }}>
        <Button label="Ver na agenda" palette={palette} onPress={onAgenda} />
        <Button label="Voltar ao início" variant="ghost" onPress={onHome} />
      </Enter>
    </View>
  )
}

export default function Book() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const params = useLocalSearchParams<{ servico?: string; remarcar?: string }>()
  const { space, appointments, availability, book, reschedule } = useStore()
  const services = useServices()
  const moving = appointments?.find((item) => item.id === params.remarcar) ?? null
  const [serviceId, setServiceId] = useState<string | null>(params.servico ?? null)
  const [professional, setProfessional] = useState<string | null>(null)
  const [day, setDay] = useState(() => dayKey(new Date()))
  const [time, setTime] = useState<string | null>(null)
  const [method, setMethod] = useState<PaymentMethod>('local')
  const [result, setResult] = useState<{ key: string; data: Availability | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ title: string; body: string } | null>(null)

  const chosen = moving?.serviceId ?? serviceId
  const service = services?.find((item) => item.id === chosen) ?? null
  const key = chosen ? `${chosen}|${day}|${moving?.id ?? ''}` : null

  useEffect(() => {
    if (!chosen || !key) return
    let active = true
    void availability(chosen, day, moving?.id).then((data) => {
      if (active) setResult({ key, data })
    })
    return () => {
      active = false
    }
    // `availability` changes identity with the store; the key already captures what matters.
  }, [key])

  const days = useMemo(
    () => Array.from({ length: 28 }, (_, index) => addDays(new Date(), index)),
    [],
  )
  if (!space) return null

  const current = result && result.key === key ? result.data : undefined
  const team = current?.professionals ?? []
  const agenda = moving
    ? (moving.professionalId ?? ANY)
    : current && !current.choose
      ? (team[0]?.id ?? ANY)
      : professional
  const slots =
    !current || agenda === null
      ? []
      : agenda === ANY && team.length
        ? [...new Set(team.flatMap((item) => current.slots[item.id] ?? []))].sort()
        : (current.slots[agenda] ?? [])
  const priced =
    service && service.priceType !== 'quote' && (service.promoPriceCents ?? service.priceCents) > 0
  const price = service ? (service.promoPriceCents ?? service.priceCents) : 0
  const start = time ? `${day}T${time}` : null
  const dayStep = current?.choose && !moving ? 3 : 2

  if (done)
    return (
      <Done
        title={done.title}
        body={done.body}
        onAgenda={() => router.replace('/agenda')}
        onHome={() => router.replace('/(tabs)')}
      />
    )

  async function confirm() {
    if (!start) return
    setBusy(true)
    setError('')
    if (moving) {
      const failure = await reschedule(moving.id, start)
      setBusy(false)
      if (failure) return setError(failure)
      return setDone({
        title: 'Horário remarcado',
        body: `${moving.serviceName} · ${dateLabel(start)} às ${time}.`,
      })
    }
    if (!service) return setBusy(false)
    const answer = await book({
      serviceId: service.id,
      professionalId: agenda || null,
      start,
      method,
    })
    setBusy(false)
    if (answer.error) {
      setError(answer.error)
      setResult(null)
      setTime(null)
      return
    }
    const who = team.find((item) => item.id === agenda)?.name
    setDone({
      title: answer.status === 'confirmed' ? 'Horário confirmado' : 'Pedido enviado',
      body: `${service.name} · ${dateLabel(start)} às ${time}${who ? ` com ${who}` : ''}.${answer.status === 'confirmed' ? '' : ' O espaço confirma e você recebe um aviso.'}`,
    })
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 140,
          gap: 20,
        }}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <View>
            <Text style={[type.small, { color: palette.muted }]}>{space.summary.name}</Text>
            <Text style={type.h1}>{moving ? 'Remarcar' : 'Agendar'}</Text>
          </View>
          <Press
            onPress={() => router.back()}
            label="Fechar"
            style={{
              width: 42,
              height: 42,
              borderRadius: 15,
              backgroundColor: colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="x" size={19} color={colors.ink} />
          </Press>
        </View>

        <Enter style={{ gap: 12 }}>
          <StepTitle index={1}>Serviço</StepTitle>
          {moving || service ? (
            <View
              style={[
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 16,
                  borderRadius: 20,
                  backgroundColor: colors.card,
                },
                shadow,
              ]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={type.strong}>{moving?.serviceName ?? service?.name}</Text>
                <Text style={[type.small, { color: palette.muted }]}>
                  {service
                    ? `${priceLabel(service)} · ${durationLabel(service.durationMinutes)}`
                    : durationLabel(moving!.durationMinutes)}
                  {moving?.professionalName ? ` · com ${moving.professionalName}` : ''}
                </Text>
              </View>
              {!moving && (
                <Press
                  onPress={() => {
                    setServiceId(null)
                    setProfessional(null)
                    setTime(null)
                  }}
                >
                  <Text style={{ fontFamily: fonts.bodySemi, color: palette.accent }}>Trocar</Text>
                </Press>
              )}
            </View>
          ) : services === null ? (
            <View
              style={{
                height: 120,
                borderRadius: 20,
                backgroundColor: palette.light,
                opacity: 0.6,
              }}
            />
          ) : (
            services.map((item) => (
              <Press
                key={item.id}
                onPress={() => {
                  setServiceId(item.id)
                  setProfessional(null)
                  setTime(null)
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 14,
                  borderRadius: 18,
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={type.strong}>{item.name}</Text>
                  <Text style={[type.small, { color: palette.muted }]}>
                    {item.category} · {durationLabel(item.durationMinutes)}
                  </Text>
                </View>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: palette.deep }}>
                  {priceLabel(item)}
                </Text>
              </Press>
            ))
          )}
        </Enter>

        {chosen && current?.choose && !moving && (
          <Enter style={{ gap: 12 }}>
            <StepTitle index={2}>Profissional</StepTitle>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -20 }}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 10, paddingVertical: 4 }}
            >
              {[
                { id: ANY, name: 'Sem preferência', role: 'Primeira livre', photoUrl: null },
                ...team,
              ].map((item) => {
                const active = professional === item.id
                return (
                  <Press
                    key={item.id || 'any'}
                    onPress={() => {
                      setProfessional(item.id)
                      setTime(null)
                    }}
                    selected={active}
                    label={item.name}
                    style={[
                      {
                        width: 112,
                        paddingVertical: 14,
                        paddingHorizontal: 8,
                        borderRadius: 22,
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: colors.card,
                        borderWidth: active ? 2 : 1.5,
                        borderColor: active ? palette.deep : colors.line,
                      },
                      active && shadow,
                    ]}
                  >
                    {item.id === ANY ? (
                      <View
                        style={{
                          width: 58,
                          height: 58,
                          borderRadius: 29,
                          backgroundColor: palette.light,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon name="users" size={22} color={palette.deep} />
                      </View>
                    ) : (
                      <Avatar name={item.name} photo={item.photoUrl} size={58} />
                    )}
                    <Text
                      style={[type.strong, { fontSize: 13.5, textAlign: 'center' }]}
                      numberOfLines={2}
                    >
                      {item.name}
                    </Text>
                    <Text
                      style={[
                        type.small,
                        { color: palette.muted, fontSize: 11.5, textAlign: 'center' },
                      ]}
                      numberOfLines={1}
                    >
                      {item.id === ANY
                        ? 'Primeira livre'
                        : (item.role ?? `${current.slots[item.id]?.length ?? 0} horários`)}
                    </Text>
                  </Press>
                )
              })}
            </ScrollView>
          </Enter>
        )}

        {chosen && agenda !== null && (
          <Enter style={{ gap: 12 }}>
            <StepTitle index={dayStep}>Dia e horário</StepTitle>
            {current && !current.choose && team[0] && !moving && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Avatar name={team[0].name} photo={team[0].photoUrl} size={30} />
                <Text style={[type.body, { color: palette.muted }]}>
                  Com{' '}
                  <Text style={{ fontFamily: fonts.bodyBold, color: colors.ink }}>
                    {team[0].name}
                  </Text>
                </Text>
              </View>
            )}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -20 }}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingVertical: 4 }}
            >
              {days
                .filter((date) => !current?.lastDate || dayKey(date) <= current.lastDate)
                .map((date) => {
                  const value = dayKey(date)
                  const active = value === day
                  return (
                    <Press
                      key={value}
                      onPress={() => {
                        setDay(value)
                        setTime(null)
                      }}
                      selected={active}
                      style={[
                        {
                          width: 52,
                          paddingVertical: 12,
                          borderRadius: 26,
                          alignItems: 'center',
                          gap: 4,
                          backgroundColor: active ? palette.deep : colors.card,
                        },
                        active && shadow,
                      ]}
                    >
                      <Text
                        style={[
                          type.small,
                          { color: active ? 'rgba(255,255,255,0.75)' : palette.muted },
                        ]}
                      >
                        {weekdayShort(date)}
                      </Text>
                      <Text
                        style={{
                          fontFamily: fonts.display,
                          fontSize: 18,
                          color: active ? '#fff' : colors.ink,
                        }}
                      >
                        {date.getDate()}
                      </Text>
                    </Press>
                  )
                })}
            </ScrollView>
            {current === undefined ? (
              <Shimmer />
            ) : current === null ? (
              <Text style={[type.body, { color: palette.muted }]}>
                Não foi possível buscar os horários. Tente de novo.
              </Text>
            ) : slots.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {slots.map((slot) => {
                  const active = slot === time
                  return (
                    <Press
                      key={slot}
                      onPress={() => setTime(slot)}
                      selected={active}
                      style={{
                        width: 74,
                        minHeight: 46,
                        borderRadius: 14,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: active ? palette.deep : colors.card,
                        borderWidth: active ? 0 : 1,
                        borderColor: colors.line,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: fonts.bodySemi,
                          fontSize: 14.5,
                          color: active ? '#fff' : colors.ink,
                        }}
                      >
                        {slot}
                      </Text>
                    </Press>
                  )
                })}
              </View>
            ) : (
              <Text style={[type.body, { color: palette.muted }]}>
                Sem horários livres neste dia. Escolha outra data.
              </Text>
            )}
          </Enter>
        )}

        {start && priced && !moving && (
          <Enter style={{ gap: 12 }}>
            <StepTitle index={dayStep + 1}>Pagamento</StepTitle>
            {methods.map((item) => {
              const active = method === item.value
              return (
                <Press
                  key={item.value}
                  onPress={() => setMethod(item.value)}
                  selected={active}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    borderRadius: 18,
                    backgroundColor: colors.card,
                    borderWidth: active ? 2 : 1.5,
                    borderColor: active ? palette.deep : colors.line,
                  }}
                >
                  <Icon name={item.icon} size={20} color={palette.deep} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.strong}>{item.label}</Text>
                    <Text style={[type.small, { color: palette.muted }]}>{item.hint}</Text>
                  </View>
                </Press>
              )
            })}
            <Text style={[type.small, { color: palette.muted }]}>
              Pix e cartão ainda são simulados: nenhuma cobrança é feita.
            </Text>
          </Enter>
        )}

        {error ? <Text style={[type.small, { color: colors.danger }]}>{error}</Text> : null}
      </ScrollView>

      {start && (
        <Enter
          from={60}
          style={[
            {
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: insets.bottom + 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 10,
              paddingLeft: 18,
              borderRadius: 24,
              backgroundColor: palette.deep,
              overflow: 'hidden',
            },
            shadow,
          ]}
        >
          <Rings />
          <View style={{ flex: 1 }}>
            <Text style={[type.small, { color: 'rgba(255,255,255,0.75)' }]}>
              {dateLabel(start)}
            </Text>
            <Text style={[type.strong, { color: '#fff' }]}>
              {time}
              {priced && !moving ? ` · ${money(price)}` : ''}
            </Text>
          </View>
          <Press
            onPress={() => void confirm()}
            disabled={busy}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 18,
              height: 48,
              borderRadius: 16,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: palette.deep }}>
              {busy ? 'Enviando…' : moving ? 'Remarcar' : 'Confirmar'}
            </Text>
            <Icon name="arrow-right" size={17} color={palette.deep} />
          </Press>
        </Enter>
      )}
    </View>
  )
}

/** Placeholder for the time grid while free slots load. */
function Shimmer() {
  const palette = usePalette()
  const pulse = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {Array.from({ length: 8 }, (_, index) => (
        <Animated.View
          key={index}
          style={{
            width: 74,
            height: 46,
            borderRadius: radius.field,
            backgroundColor: palette.light,
            opacity: pulse,
          }}
        />
      ))}
    </View>
  )
}
