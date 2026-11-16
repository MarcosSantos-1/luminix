import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useStore, type Anamnesis, type Sex } from '../src/store'
import { colors, fonts, paletteFor, radius } from '../src/theme'
import { Button, Enter, ErrorText, Field, Icon, Press, SpaceLogo, type } from '../src/ui'
import { Preparing } from '../src/ui/preparing'

const steps = ['Foto', 'Sobre você', 'Saúde'] as const

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

/** DD/MM/AAAA as the person types. */
function maskDate(text: string) {
  const digits = text.replace(/\D/g, '').slice(0, 8)
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/')
}

function toIso(masked: string) {
  const match = masked.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  const [, day, month, year] = match
  const iso = `${year}-${month}-${day}`
  const date = new Date(`${iso}T12:00:00Z`)
  return date.getUTCDate() === Number(day) && iso >= '1900-01-01' && date.getTime() < Date.now()
    ? iso
    : null
}

const fromIso = (iso?: string) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : ''

export default function AnamnesisScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { espaco } = useLocalSearchParams<{ espaco?: string }>()
  const { account, saveAnamnesis } = useStore()
  const own = espaco ? (account?.spaces.find((item) => item.summary.slug === espaco) ?? null) : null
  const previous: Anamnesis | null = own ? own.ownAnamnesis : (account?.anamnesis ?? null)
  const palette = paletteFor(own?.summary.theme)

  const [step, setStep] = useState(0)
  const [photo, setPhoto] = useState(previous?.photo ?? '')
  const [sex, setSex] = useState<Sex | ''>(previous?.sex ?? '')
  const [birth, setBirth] = useState(fromIso(previous?.birthDate))
  const [allergies, setAllergies] = useState(previous?.allergies ?? '')
  const [healthNotes, setHealthNotes] = useState(previous?.healthNotes ?? '')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [preparing, setPreparing] = useState(false)

  async function pick(source: 'camera' | 'library') {
    setError('')
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted && Platform.OS !== 'web')
        return setError('Permita o acesso nas configurações do celular para enviar a foto.')
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
      setError('Não foi possível usar essa imagem. Tente outra.')
    }
  }

  async function next() {
    const birthDate = toIso(birth)
    const problem =
      step === 0
        ? !photo && 'Adicione uma foto do rosto para continuar.'
        : step === 1
          ? !sex
            ? 'Selecione o sexo biológico.'
            : !birthDate && 'Informe uma data de nascimento válida.'
          : !consent && 'Confirme o uso das informações.'
    if (problem) return setError(problem)
    setError('')
    if (step < 2) return setStep(step + 1)
    setBusy(true)
    const failure = await saveAnamnesis(own?.summary.slug ?? null, {
      photo,
      sex: sex as Sex,
      birthDate: birthDate!,
      allergies: allergies.trim(),
      healthNotes: healthNotes.trim(),
    })
    setBusy(false)
    if (failure) return setError(failure)
    if (own && !previous) return setPreparing(true)
    if (previous) return router.back()
    router.replace('/')
  }

  if (preparing && own)
    return <Preparing space={own.summary} onDone={() => router.replace('/(tabs)')} />

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 24,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 24,
          gap: 20,
          flexGrow: 1,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 44,
          }}
        >
          {step > 0 ? (
            <Press onPress={() => setStep(step - 1)} label="Voltar" style={styles.round}>
              <Icon name="arrow-left" size={19} color={colors.ink} />
            </Press>
          ) : previous ? (
            <Press onPress={() => router.back()} label="Fechar" style={styles.round}>
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
          {own ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <SpaceLogo space={own.summary} size={28} />
              <Text style={type.strong}>{own.summary.name}</Text>
            </View>
          ) : (
            <Text style={[type.small, { color: palette.muted, fontFamily: fonts.bodySemi }]}>
              Sua ficha Luminix
            </Text>
          )}
        </View>

        <View
          style={{ flexDirection: 'row', gap: 8 }}
          accessibilityLabel={`Etapa ${step + 1} de 3`}
        >
          {steps.map((label, index) => (
            <View key={label} style={{ flex: 1, gap: 7 }}>
              <View
                style={{
                  height: 4,
                  borderRadius: radius.pill,
                  backgroundColor: index <= step ? palette.deep : colors.line,
                }}
              />
              <Text
                style={[
                  type.small,
                  {
                    color: index === step ? colors.ink : palette.muted,
                    fontFamily: fonts.bodySemi,
                  },
                ]}
              >
                {label}
              </Text>
            </View>
          ))}
        </View>

        <Enter key={step} style={{ gap: 16 }}>
          {step === 0 && (
            <>
              <Text style={type.h1}>
                {own ? 'Uma foto para o espaço reconhecer você' : 'Uma foto para reconhecerem você'}
              </Text>
              <Text style={[type.body, { color: palette.muted }]}>
                Rosto visível, sem filtro. Ela aparece na sua ficha e para a equipe na recepção.
              </Text>
              <View style={{ alignItems: 'center', gap: 16, paddingVertical: 10 }}>
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
                    <Text style={[styles.chipText, { color: '#fff' }]}>Tirar foto</Text>
                  </Press>
                  <Press
                    onPress={() => void pick('library')}
                    style={[
                      styles.chip,
                      { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line },
                    ]}
                  >
                    <Icon name="image" size={17} color={colors.ink} />
                    <Text style={styles.chipText}>Galeria</Text>
                  </Press>
                </View>
              </View>
            </>
          )}
          {step === 1 && (
            <>
              <Text style={type.h1}>Sobre você</Text>
              <Text style={[type.body, { color: palette.muted }]}>
                O espaço usa para indicar os cuidados certos.
              </Text>
              <Text style={[type.strong, { fontSize: 13.5 }]}>Sexo biológico</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {(
                  [
                    ['female', 'Feminino'],
                    ['male', 'Masculino'],
                  ] as const
                ).map(([value, label]) => (
                  <View key={value} style={{ flex: 1 }}>
                    <Press
                      onPress={() => setSex(value)}
                      selected={sex === value}
                      style={[
                        styles.choice,
                        sex === value && {
                          backgroundColor: palette.deep,
                          borderColor: palette.deep,
                        },
                      ]}
                    >
                      <Text style={[type.strong, sex === value && { color: '#fff' }]}>{label}</Text>
                    </Press>
                  </View>
                ))}
              </View>
              <Text style={[type.small, { color: palette.muted }]}>
                Usado em procedimentos como depilação e tratamentos corporais.
              </Text>
              <Field
                label="Data de nascimento"
                value={birth}
                onChangeText={(text) => setBirth(maskDate(text))}
                placeholder="DD/MM/AAAA"
                keyboardType="number-pad"
                maxLength={10}
                palette={palette}
              />
            </>
          )}
          {step === 2 && (
            <>
              <Text style={type.h1}>Algo que o espaço precisa saber?</Text>
              <Text style={[type.body, { color: palette.muted }]}>
                Opcional. Dá para atualizar depois no seu perfil.
              </Text>
              <Field
                label="Alergias ou sensibilidades"
                value={allergies}
                onChangeText={setAllergies}
                placeholder="Ex.: látex, esmalte, algum ativo"
                maxLength={200}
                palette={palette}
              />
              <Field
                label="Observações de saúde"
                value={healthNotes}
                onChangeText={setHealthNotes}
                placeholder="Ex.: gestante, medicação, cirurgia recente"
                maxLength={500}
                multiline
                palette={palette}
                style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: 14 }}
              />
              <Press
                onPress={() => setConsent(!consent)}
                selected={consent}
                style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}
              >
                <View
                  style={[
                    styles.check,
                    consent && { backgroundColor: palette.deep, borderWidth: 0 },
                  ]}
                >
                  {consent && <Icon name="check" size={15} color="#fff" />}
                </View>
                <Text style={[type.small, { flex: 1, color: palette.muted }]}>
                  {own
                    ? `Autorizo ${own.summary.name} a usar estas informações no meu atendimento. Esta ficha vale só para este espaço.`
                    : 'Autorizo o uso destas informações no meu atendimento. Cada espaço só vê a ficha quando eu permitir.'}
                </Text>
              </Press>
            </>
          )}
        </Enter>

        <View style={{ flex: 1 }} />
        <ErrorText>{error}</ErrorText>
        <Button
          label={busy ? 'Salvando…' : step < 2 ? 'Continuar' : 'Concluir ficha'}
          icon="arrow-right"
          palette={palette}
          disabled={busy}
          onPress={() => void next()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  round: {
    width: 42,
    height: 42,
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
  chipText: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: colors.ink },
  choice: {
    minHeight: 54,
    borderRadius: radius.field,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
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
