import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  levelNames,
  minutesFor,
  missingSteps,
  questionVisible,
  stepComplete,
  stepsFor,
  type AnamnesisRecord,
  type Answers,
  type AnswerValue,
  type Level,
  type Question,
} from '@luminix/contracts/anamnesis'
import type { SpaceSummary } from '../api'
import { colors, fonts, paletteFor, radius, type Palette } from '../theme'
import { Button, ErrorText, Icon, Press, SpaceLogo, type } from './index'

export type WizardMode = 'new' | 'upgrade' | 'renew' | 'edit'

/** Square 360px JPEG: enough for the record, small enough for the API (≤ 400 kB). */
async function portrait(uri: string, width: number, height: number) {
  const side = Math.min(width, height)
  const result = await manipulateAsync(
    uri,
    [
      {
        crop: {
          originX: (width - side) / 2,
          originY: (height - side) / 2,
          width: side,
          height: side,
        },
      },
      { resize: { width: 360, height: 360 } },
    ],
    { compress: 0.8, format: SaveFormat.JPEG, base64: true },
  )
  return `data:image/jpeg;base64,${result.base64}`
}

/** DD/MM/AAAA while typing ↔ YYYY-MM-DD stored. */
const maskDate = (text: string) => {
  const digits = text.replace(/\D/g, '').slice(0, 8)
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/')
}
const toIso = (masked: string) => {
  const match = masked.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return ''
  const iso = `${match[3]}-${match[2]}-${match[1]}`
  const date = new Date(`${iso}T12:00:00Z`)
  return date.getUTCDate() === Number(match[1]) &&
    iso >= '1900-01-01' &&
    date.getTime() < Date.now()
    ? iso
    : ''
}
const fromIso = (iso: unknown) =>
  typeof iso === 'string' && iso.length === 10
    ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
    : ''

function Option({
  label,
  active,
  onPress,
  palette,
  flex = true,
}: {
  label: string
  active: boolean
  onPress: () => void
  palette: Palette
  flex?: boolean
}) {
  return (
    <View style={flex ? { flex: 1, minWidth: 96 } : undefined}>
      <Press
        onPress={onPress}
        selected={active}
        style={[
          styles.option,
          !flex && { paddingHorizontal: 16, minHeight: 44 },
          active && { backgroundColor: palette.deep, borderColor: palette.deep },
        ]}
      >
        <Text style={[styles.optionText, active && { color: '#fff' }]}>{label}</Text>
      </Press>
    </View>
  )
}

function Reveal({
  value,
  placeholder,
  onChange,
  palette,
}: {
  value: string
  placeholder: string
  onChange: (text: string) => void
  palette: Palette
}) {
  const appear = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 220, useNativeDriver: true }).start()
  }, [appear])
  return (
    <Animated.View
      style={{
        opacity: appear,
        transform: [
          { translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) },
        ],
      }}
    >
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#a2a2ae"
        maxLength={300}
        style={[styles.input, { borderColor: palette.accent }]}
      />
    </Animated.View>
  )
}

function QuestionField({
  question,
  answers,
  set,
  palette,
}: {
  question: Question
  answers: Answers
  set: (key: string, value: AnswerValue | undefined) => void
  palette: Palette
}) {
  const [birth, setBirth] = useState(question.kind === 'date' ? fromIso(answers[question.key]) : '')
  if (!questionVisible(question, answers)) return null
  const label =
    'label' in question && question.label ? (
      <Text style={styles.label}>{question.label}</Text>
    ) : null
  switch (question.kind) {
    case 'choice':
      return (
        <View style={styles.field}>
          {label}
          <View style={styles.row}>
            {question.options.map((option) => (
              <Option
                key={option.value}
                label={option.label}
                active={answers[question.key] === option.value}
                onPress={() => set(question.key, option.value)}
                palette={palette}
              />
            ))}
          </View>
        </View>
      )
    case 'yesno':
      return (
        <View style={styles.field}>
          {label}
          <View style={styles.row}>
            {(
              [
                ['no', 'Não'],
                ['yes', 'Sim'],
              ] as const
            ).map(([value, text]) => (
              <Option
                key={value}
                label={text}
                active={answers[question.key] === value}
                onPress={() => set(question.key, value)}
                palette={palette}
              />
            ))}
          </View>
          {question.details && answers[question.key] === 'yes' && (
            <Reveal
              value={String(answers[question.details.key] ?? '')}
              placeholder={question.details.placeholder}
              onChange={(text) => set(question.details!.key, text)}
              palette={palette}
            />
          )}
        </View>
      )
    case 'multi': {
      const selected = (answers[question.key] as string[] | undefined) ?? []
      return (
        <View style={styles.field}>
          {label}
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            {question.options.map((option) => {
              const on = selected.includes(option.value)
              return (
                <Option
                  key={option.value}
                  flex={false}
                  label={on ? `✓ ${option.label}` : option.label}
                  active={on}
                  onPress={() =>
                    set(
                      question.key,
                      on
                        ? selected.filter((item) => item !== option.value)
                        : [...selected, option.value],
                    )
                  }
                  palette={palette}
                />
              )
            })}
          </View>
        </View>
      )
    }
    case 'toggles':
      return (
        <View style={styles.field}>
          {label}
          {question.items.map((item) => {
            const on = answers[item.key] === true
            return (
              <View key={item.key} style={{ gap: 8 }}>
                <Press
                  onPress={() => set(item.key, !on)}
                  selected={on}
                  style={[styles.toggle, on && { borderColor: palette.deep, borderWidth: 2 }]}
                >
                  <Text style={[type.strong, { flex: 1 }]}>{item.label}</Text>
                  <View style={[styles.switch, on && { backgroundColor: palette.deep }]}>
                    <View style={[styles.knob, on && { transform: [{ translateX: 18 }] }]} />
                  </View>
                </Press>
                {item.details && on && (
                  <Reveal
                    value={String(answers[item.details.key] ?? '')}
                    placeholder={item.details.placeholder}
                    onChange={(text) => set(item.details!.key, text)}
                    palette={palette}
                  />
                )}
              </View>
            )
          })}
          <Text style={[type.small, { color: palette.muted }]}>
            Nada se aplica? É só continuar.
          </Text>
        </View>
      )
    case 'date':
      return (
        <View style={styles.field}>
          {label}
          <TextInput
            value={birth}
            onChangeText={(text) => {
              const masked = maskDate(text)
              setBirth(masked)
              set(question.key, toIso(masked) || undefined)
            }}
            placeholder="DD/MM/AAAA"
            placeholderTextColor="#a2a2ae"
            keyboardType="number-pad"
            maxLength={10}
            style={styles.input}
          />
        </View>
      )
    case 'counter': {
      const value = Number(answers[question.key] ?? 3)
      return (
        <View style={styles.field}>
          {label}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            <Press
              onPress={() => set(question.key, Math.max(question.min, value - 1))}
              label="Menos"
              style={styles.round}
            >
              <Icon name="minus" size={20} color={colors.ink} />
            </Press>
            <Text
              style={{ fontFamily: fonts.display, fontSize: 30, minWidth: 56, textAlign: 'center' }}
            >
              {value}
              {question.unit}
            </Text>
            <Press
              onPress={() => set(question.key, Math.min(question.max, value + 1))}
              label="Mais"
              style={styles.round}
            >
              <Icon name="plus" size={20} color={colors.ink} />
            </Press>
          </View>
        </View>
      )
    }
    default:
      return null
  }
}

/** Slides the step in from the side it was reached from. */
function Stage({ direction, children }: { direction: 1 | -1; children: React.ReactNode }) {
  const enter = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [enter])
  return (
    <Animated.View
      style={{
        gap: 18,
        opacity: enter,
        transform: [
          {
            translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [28 * direction, 0] }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  )
}

export function AnamnesisWizard({
  mode,
  level,
  initial,
  space,
  saving,
  error,
  onSave,
  onClose,
}: {
  mode: WizardMode
  level: Level
  initial: AnamnesisRecord | null
  space: SpaceSummary | null
  saving: boolean
  error: string
  onSave: (record: { level: Level; answers: Answers; photo: string }) => void
  onClose?: () => void
}) {
  const insets = useSafeAreaInsets()
  const palette = paletteFor(space?.theme)
  const [answers, setAnswers] = useState<Answers>(
    mode === 'new' ? {} : { ...(initial?.answers ?? {}) },
  )
  const [photo, setPhoto] = useState(mode === 'new' ? '' : (initial?.photo ?? ''))
  const [plan] = useState(() =>
    mode === 'upgrade'
      ? missingSteps(level, initial?.answers ?? {}, initial?.photo).map((step) => step.id)
      : null,
  )
  const [index, setIndex] = useState(-1)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [consent, setConsent] = useState(false)
  const [problem, setProblem] = useState('')
  const progress = useRef(new Animated.Value(0)).current

  const visible = stepsFor(level, answers).filter((step) => !plan || plan.includes(step.id))
  const total = visible.length
  const step = index >= 0 && index < total ? visible[index] : null
  const atConsent = index >= total

  useEffect(() => {
    Animated.timing(progress, {
      toValue: index < 0 ? 0 : Math.min(index + 1, total + 1) / (total + 1),
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
  }, [index, total, progress])

  function set(key: string, value: AnswerValue | undefined) {
    setProblem('')
    setAnswers((current) => {
      const next = { ...current }
      if (value === undefined || value === '') delete next[key]
      else next[key] = value
      return next
    })
  }
  function go(to: number) {
    setDirection(to > index ? 1 : -1)
    setProblem('')
    setIndex(to)
  }
  function next() {
    if (step && !stepComplete(step, answers, photo)) return setProblem('Responda para continuar.')
    go(index + 1)
  }
  async function pick(source: 'camera' | 'library') {
    setProblem('')
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted && Platform.OS !== 'web')
        return setProblem('Permita o acesso nas configurações do celular para enviar a foto.')
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
        cameraType: ImagePicker.CameraType.front,
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options)
      const asset = result.canceled ? null : result.assets[0]
      if (asset) setPhoto(await portrait(asset.uri, asset.width, asset.height))
    } catch {
      setProblem('Não foi possível usar essa imagem. Tente outra.')
    }
  }

  const who = space?.name ?? 'os espaços que você permitir'
  const intro = {
    new: {
      title: space ? `${space.name} pede uma ficha` : 'Sua ficha Luminix',
      body: `${total} etapas rápidas, cerca de ${minutesFor(total)} min. Você responde uma vez e reaproveita nos espaços que quiser.`,
    },
    upgrade: {
      title: 'Faltam só algumas perguntas',
      body: `${space?.name ?? 'Este espaço'} pede a ${levelNames[level].toLowerCase()}. Seus dados básicos já estão aqui: são ${total} etapas, cerca de ${minutesFor(total)} min.`,
    },
    renew: {
      title: 'Hora de atualizar sua ficha',
      body: 'Fichas de saúde valem um ano. Suas respostas já estão preenchidas: confira, ajuste o que mudou e confirme.',
    },
    edit: {
      title: 'Revisar sua ficha',
      body: 'Suas respostas estão preenchidas. Mude o que quiser.',
    },
  }[mode]

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 22, gap: 14 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 44,
          }}
        >
          {index >= 0 ? (
            <Press onPress={() => go(index - 1)} label="Voltar" style={styles.round}>
              <Icon name="arrow-left" size={19} color={colors.ink} />
            </Press>
          ) : onClose ? (
            <Press onPress={onClose} label="Fechar" style={styles.round}>
              <Icon name="x" size={19} color={colors.ink} />
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
          {space ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <SpaceLogo space={space} size={28} />
              <Text style={type.strong} numberOfLines={1}>
                {space.name}
              </Text>
            </View>
          ) : (
            <Text style={[type.small, { color: palette.muted, fontFamily: fonts.bodySemi }]}>
              {levelNames[level]}
            </Text>
          )}
        </View>
        {index >= 0 && (
          <View
            style={{
              height: 5,
              borderRadius: radius.pill,
              backgroundColor: colors.line,
              overflow: 'hidden',
            }}
          >
            <Animated.View
              style={{
                height: 5,
                backgroundColor: palette.deep,
                width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              }}
            />
          </View>
        )}
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 22, paddingBottom: 30, gap: 18, flexGrow: 1 }}
      >
        <Stage key={index} direction={direction}>
          {index < 0 && (
            <>
              <View
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 24,
                  backgroundColor: palette.deep,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 20,
                }}
              >
                <Icon name={mode === 'renew' ? 'refresh-cw' : 'clipboard'} size={28} color="#fff" />
              </View>
              <Text style={[type.kicker, { color: palette.accent }]}>{levelNames[level]}</Text>
              <Text style={type.h1}>{intro.title}</Text>
              <Text style={[type.body, { color: palette.muted }]}>{intro.body}</Text>
              {[
                'Uma pergunta por vez, sem textos longos.',
                `Só ${who} verá as respostas.`,
                ...(level > 1 ? ['Fichas de saúde são confirmadas uma vez por ano.'] : []),
              ].map((line) => (
                <View key={line} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: palette.accent,
                    }}
                  />
                  <Text style={[type.body, { color: palette.muted, flex: 1 }]}>{line}</Text>
                </View>
              ))}
            </>
          )}
          {step && (
            <>
              <Text style={type.h1}>{step.title}</Text>
              <Text style={[type.body, { color: palette.muted }]}>{step.subtitle}</Text>
              {step.questions.map((question, position) =>
                question.kind === 'photo' ? (
                  <View key="photo" style={{ alignItems: 'center', gap: 16, paddingVertical: 10 }}>
                    <View
                      style={{
                        width: 168,
                        height: 168,
                        borderRadius: 84,
                        overflow: 'hidden',
                        backgroundColor: palette.light,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {photo ? (
                        <Image source={{ uri: photo }} style={{ width: 168, height: 168 }} />
                      ) : (
                        <Icon name="user" size={54} color={palette.accent} />
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Press
                        onPress={() => void pick('camera')}
                        style={[styles.chip, { backgroundColor: palette.deep }]}
                      >
                        <Icon name="camera" size={17} color="#fff" />
                        <Text style={[styles.optionText, { color: '#fff' }]}>Tirar foto</Text>
                      </Press>
                      <Press
                        onPress={() => void pick('library')}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: colors.card,
                            borderWidth: 1.5,
                            borderColor: colors.line,
                          },
                        ]}
                      >
                        <Icon name="image" size={17} color={colors.ink} />
                        <Text style={styles.optionText}>Galeria</Text>
                      </Press>
                    </View>
                  </View>
                ) : (
                  <QuestionField
                    key={position}
                    question={question}
                    answers={answers}
                    set={set}
                    palette={palette}
                  />
                ),
              )}
            </>
          )}
          {atConsent && (
            <>
              <Text style={type.h1}>Último passo</Text>
              <Text style={[type.body, { color: palette.muted }]}>
                Confirme para salvar sua ficha.
              </Text>
              <Press
                onPress={() => setConsent(!consent)}
                selected={consent}
                style={[
                  styles.toggle,
                  { alignItems: 'flex-start', paddingVertical: 16 },
                  consent && { borderColor: palette.deep, borderWidth: 2 },
                ]}
              >
                <View
                  style={[
                    styles.check,
                    consent && { backgroundColor: palette.deep, borderWidth: 0 },
                  ]}
                >
                  {consent && <Icon name="check" size={15} color="#fff" />}
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={type.strong}>As informações são verdadeiras</Text>
                  <Text style={[type.small, { color: palette.muted }]}>
                    Autorizo {who} a usar estas respostas no meu atendimento e vou atualizá-las se
                    algo mudar.
                  </Text>
                </View>
              </Press>
            </>
          )}
        </Stage>
      </ScrollView>

      <View style={{ paddingHorizontal: 22, paddingBottom: insets.bottom + 16, gap: 10 }}>
        <ErrorText>{problem || error}</ErrorText>
        {index < 0 ? (
          <>
            <Button
              label={mode === 'renew' ? 'Revisar respostas' : 'Começar'}
              icon="arrow-right"
              palette={palette}
              onPress={() => go(0)}
            />
            {mode === 'renew' && (
              <Button label="Nada mudou, confirmar" variant="ghost" onPress={() => go(total)} />
            )}
          </>
        ) : atConsent ? (
          <Button
            label={saving ? 'Salvando…' : 'Salvar ficha'}
            icon="check"
            palette={palette}
            disabled={!consent || saving}
            onPress={() => onSave({ level, answers, photo })}
          />
        ) : (
          <Button label="Continuar" icon="arrow-right" palette={palette} onPress={next} />
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  field: { gap: 10 },
  label: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  row: { flexDirection: 'row', gap: 10 },
  option: {
    minHeight: 54,
    borderRadius: radius.field,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  optionText: {
    fontFamily: fonts.bodySemi,
    fontSize: 14.5,
    color: colors.ink,
    textAlign: 'center',
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: radius.field,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  switch: { width: 44, height: 26, borderRadius: 13, backgroundColor: '#cfcfd8', padding: 3 },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  input: {
    minHeight: 54,
    borderRadius: radius.field,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 15,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
