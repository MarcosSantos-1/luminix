import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { durationLabel } from '../../src/api'
import { addDays, dateLabel, dayKey, monthLong, parseDay, weekdayShort } from '../../src/format'
import { displayStatus, useStore, type Appointment } from '../../src/store'
import { colors, fonts, radius, shadow } from '../../src/theme'
import { Button, Enter, Icon, Press, Rings, type } from '../../src/ui'
import { EmptyState, StatusBadge, TabPage, money, usePalette } from '../../src/ui/space'

export default function Agenda() {
  const router = useRouter()
  const palette = usePalette()
  const { space, appointments, policy, cancel } = useStore()
  const today = useMemo(() => new Date(), [])
  const [selected, setSelected] = useState(() => dayKey(today))
  const [open, setOpen] = useState<Appointment | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const list = useMemo(
    () => [...(appointments ?? [])].sort((a, b) => a.start.localeCompare(b.start)),
    [appointments],
  )
  const busyDays = useMemo(
    () =>
      new Set(
        list
          .filter((item) => displayStatus(item) !== 'cancelled')
          .map((item) => item.start.slice(0, 10)),
      ),
    [list],
  )
  const week = useMemo(
    () => Array.from({ length: 21 }, (_, index) => addDays(today, index - 3)),
    [today],
  )
  if (!space) return null

  const dayItems = list.filter((item) => item.start.startsWith(selected))
  const upcoming = list.filter(
    (item) =>
      ['confirmed', 'requested'].includes(displayStatus(item)) && !item.start.startsWith(selected),
  )
  const canChange = open && ['confirmed', 'requested'].includes(displayStatus(open))

  return (
    <TabPage
      title={selected === dayKey(today) ? 'Hoje' : dateLabel(selected).split(',')[1].trim()}
      kicker={`${monthLong(parseDay(selected))[0].toUpperCase()}${monthLong(parseDay(selected)).slice(1)} · ${space.summary.name}`}
      action={
        <Press
          onPress={() => router.push('/agendar')}
          label="Novo agendamento"
          style={{
            width: 46,
            height: 46,
            borderRadius: 16,
            backgroundColor: palette.deep,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="plus" size={20} color="#fff" />
        </Press>
      }
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -20 }}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingVertical: 6 }}
        contentOffset={{ x: 3 * 60, y: 0 }}
      >
        {week.map((date) => {
          const key = dayKey(date)
          const active = key === selected
          return (
            <Press
              key={key}
              onPress={() => setSelected(key)}
              selected={active}
              label={dateLabel(key)}
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
                style={[type.small, { color: active ? 'rgba(255,255,255,0.75)' : palette.muted }]}
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
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: busyDays.has(key)
                    ? active
                      ? '#fff'
                      : palette.accent
                    : 'transparent',
                }}
              />
            </Press>
          )
        })}
      </ScrollView>

      {appointments === null ? (
        <View
          style={{ height: 120, borderRadius: 24, backgroundColor: palette.light, opacity: 0.6 }}
        />
      ) : dayItems.length ? (
        <View style={{ gap: 12 }}>
          {dayItems.map((item, index) => {
            const dark = index === 0 && displayStatus(item) !== 'cancelled'
            return (
              <Enter key={item.id} delay={index * 70} style={{ flexDirection: 'row', gap: 14 }}>
                <View style={{ alignItems: 'center', width: 18 }}>
                  <View
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: colors.ink,
                      backgroundColor: dark ? colors.ink : colors.bg,
                      marginTop: 18,
                    }}
                  />
                  {index < dayItems.length - 1 && (
                    <View
                      style={{ flex: 1, width: 2, backgroundColor: colors.ink, opacity: 0.8 }}
                    />
                  )}
                </View>
                <Press
                  onPress={() => {
                    setError('')
                    setOpen(item)
                  }}
                  style={{
                    flex: 1,
                    padding: dark ? 20 : 16,
                    borderRadius: 24,
                    gap: 6,
                    overflow: 'hidden',
                    backgroundColor: dark ? palette.deep : colors.card,
                  }}
                >
                  {dark && <Rings />}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                    <Text
                      style={[
                        type.h2,
                        { fontSize: 19, flex: 1, color: dark ? '#fff' : colors.ink },
                      ]}
                    >
                      {item.serviceName}
                    </Text>
                    <Text
                      style={{
                        fontFamily: fonts.bodySemi,
                        fontSize: 14,
                        color: dark ? '#fff' : colors.ink,
                      }}
                    >
                      {item.start.slice(11, 16)}
                    </Text>
                  </View>
                  <Text
                    style={[type.small, { color: dark ? 'rgba(255,255,255,0.75)' : palette.muted }]}
                  >
                    {durationLabel(item.durationMinutes)}
                    {item.professionalName ? ` · com ${item.professionalName}` : ''}
                  </Text>
                  <StatusBadge appointment={item} />
                </Press>
              </Enter>
            )
          })}
        </View>
      ) : (
        <Text style={[type.body, { color: palette.muted }]}>Nada marcado neste dia.</Text>
      )}

      <Text style={[type.h2, { marginTop: 8 }]}>Próximos</Text>
      {upcoming.length ? (
        upcoming.map((item) => (
          <Press
            key={item.id}
            onPress={() => {
              setError('')
              setOpen(item)
            }}
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderRadius: 20,
                backgroundColor: colors.card,
              },
              shadow,
            ]}
          >
            <View
              style={{
                width: 50,
                paddingVertical: 7,
                borderRadius: 15,
                backgroundColor: palette.light,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontFamily: fonts.display, fontSize: 19, color: palette.deep }}>
                {item.start.slice(8, 10)}
              </Text>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: palette.deep }}>
                {weekdayShort(parseDay(item.start))}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={type.strong} numberOfLines={1}>
                {item.serviceName}
              </Text>
              <Text style={[type.small, { color: palette.muted }]}>
                {item.start.slice(11, 16)} · {durationLabel(item.durationMinutes)}
              </Text>
            </View>
            <StatusBadge appointment={item} />
          </Press>
        ))
      ) : (
        <EmptyState
          icon="calendar"
          title="Sem horários pela frente"
          body="Toque no + para marcar o próximo."
        />
      )}

      <Modal
        visible={Boolean(open)}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(15,15,20,0.5)', justifyContent: 'flex-end' }}
          onPress={() => setOpen(null)}
        >
          {open && (
            <Pressable
              onPress={() => {}}
              style={{
                backgroundColor: colors.bg,
                borderTopLeftRadius: 30,
                borderTopRightRadius: 30,
                padding: 22,
                paddingBottom: 36,
                gap: 14,
              }}
            >
              <View
                style={{
                  alignSelf: 'center',
                  width: 40,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: colors.line,
                }}
              />
              <Text style={type.h2}>{open.serviceName}</Text>
              <StatusBadge appointment={open} />
              {[
                ['Quando', `${dateLabel(open.start)} às ${open.start.slice(11, 16)}`],
                ['Duração', durationLabel(open.durationMinutes)],
                ...(open.professionalName ? [['Com', open.professionalName]] : []),
                ...(open.priceCents ? [['Valor', money(open.priceCents)]] : []),
              ].map(([label, value]) => (
                <View
                  key={label}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingTop: 12,
                    borderTopWidth: 1,
                    borderTopColor: colors.line,
                  }}
                >
                  <Text style={[type.body, { color: palette.muted }]}>{label}</Text>
                  <Text style={[type.strong, { flexShrink: 1, textAlign: 'right' }]}>{value}</Text>
                </View>
              ))}
              {policy?.instructions ? (
                <Text style={[type.small, { color: palette.muted }]}>{policy.instructions}</Text>
              ) : null}
              {error ? <Text style={[type.small, { color: colors.danger }]}>{error}</Text> : null}
              {canChange ? (
                <>
                  <Button
                    label="Remarcar"
                    palette={palette}
                    onPress={() => {
                      const id = open.id
                      setOpen(null)
                      router.push(`/agendar?remarcar=${id}`)
                    }}
                  />
                  <Button
                    label={busy ? 'Cancelando…' : 'Cancelar horário'}
                    variant="ghost"
                    disabled={busy}
                    onPress={async () => {
                      setBusy(true)
                      const failure = await cancel(open.id)
                      setBusy(false)
                      if (failure) return setError(failure)
                      setOpen(null)
                    }}
                  />
                </>
              ) : (
                <Button
                  label="Agendar de novo"
                  palette={palette}
                  onPress={() => {
                    const id = open.serviceId
                    setOpen(null)
                    router.push(`/agendar?servico=${id}`)
                  }}
                />
              )}
            </Pressable>
          )}
        </Pressable>
      </Modal>
      <View style={{ height: radius.card }} />
    </TabPage>
  )
}
