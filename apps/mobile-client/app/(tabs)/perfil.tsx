import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { useStore } from '../../src/store'
import { colors, fonts, shadow } from '../../src/theme'
import {
  Button,
  ErrorText,
  Enter,
  Field,
  Icon,
  Press,
  Rings,
  SpaceLogo,
  type,
  type IconName,
} from '../../src/ui'
import { Avatar, TabPage, usePalette } from '../../src/ui/space'

type Panel = 'data' | 'password' | 'help' | null

const faq = [
  [
    'Como marco um horário?',
    'Toque em Agendar, escolha o serviço, a profissional (quando houver mais de uma), o dia e o horário.',
  ],
  [
    'Posso remarcar ou cancelar?',
    'Sim. Abra a Agenda e toque no horário. O espaço define até quando dá para mudar pelo app.',
  ],
  [
    'Frequento mais de um espaço.',
    'Use Trocar de espaço. A conta é a mesma; horários e histórico ficam separados por espaço.',
  ],
  ['Quem vê minha ficha?', 'Só os espaços que você permitiu ao entrar neles.'],
]

export default function Profile() {
  const router = useRouter()
  const palette = usePalette()
  const { account, space, anamnesis, signOut, saveProfile, changePassword } = useStore()
  const [panel, setPanel] = useState<Panel>(null)
  const [name, setName] = useState(account?.name ?? '')
  const [phone, setPhone] = useState(account?.phone ?? '')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  if (!account || !space) return null

  const close = () => {
    setPanel(null)
    setMessage('')
  }
  const answered = anamnesis?.answeredAt
    ? new Date(anamnesis.answeredAt).toLocaleDateString('pt-BR')
    : ''
  const rows: { icon: IconName; label: string; hint: string; onPress: () => void }[] = [
    { icon: 'user', label: 'Meus dados', hint: 'Nome e celular', onPress: () => setPanel('data') },
    {
      icon: 'clipboard',
      label: 'Ficha de anamnese',
      hint: `${space.shareAnamnesis ? 'Ficha da conta' : 'Ficha só deste espaço'}${answered ? ` · ${answered}` : ''}`,
      onPress: () =>
        router.push(space.shareAnamnesis ? '/anamnese' : `/anamnese?espaco=${space.summary.slug}`),
    },
    {
      icon: 'lock',
      label: 'Acesso e senha',
      hint: account.email,
      onPress: () => setPanel('password'),
    },
    {
      icon: 'bell',
      label: 'Notificações',
      hint: 'Avisos do espaço',
      onPress: () => router.push('/notificacoes'),
    },
    {
      icon: 'shield',
      label: 'Permissões do app',
      hint: 'Notificações, localização e câmera',
      onPress: () => router.push('/permissoes'),
    },
    {
      icon: 'help-circle',
      label: 'Ajuda',
      hint: 'Perguntas frequentes',
      onPress: () => setPanel('help'),
    },
  ]

  return (
    <TabPage title="Perfil" kicker="Sua conta Luminix">
      <Enter delay={60}>
        <View
          style={{
            backgroundColor: palette.deep,
            borderRadius: 30,
            padding: 20,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
            overflow: 'hidden',
          }}
        >
          <Rings />
          <Avatar name={account.name} photo={anamnesis?.photo} size={70} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.h2, { color: '#fff' }]}>{account.name}</Text>
            <Text style={[type.small, { color: 'rgba(255,255,255,0.74)' }]}>{account.email}</Text>
            {account.phone ? (
              <Text style={[type.small, { color: 'rgba(255,255,255,0.74)' }]}>{account.phone}</Text>
            ) : null}
          </View>
        </View>
      </Enter>

      <Enter delay={120}>
        <Press
          onPress={() => router.push('/espacos')}
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 14,
              borderRadius: 22,
              backgroundColor: colors.card,
            },
            shadow,
          ]}
        >
          <SpaceLogo space={space.summary} size={46} />
          <View style={{ flex: 1 }}>
            <Text style={type.strong} numberOfLines={1}>
              {space.summary.name}
            </Text>
            <Text style={[type.small, { color: palette.muted }]}>
              {account.spaces.length > 1
                ? `Espaço atual · ${account.spaces.length} vinculados`
                : 'Seu espaço atual'}
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: palette.light,
            }}
          >
            <Icon name="repeat" size={14} color={palette.deep} />
            <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: palette.deep }}>
              Trocar
            </Text>
          </View>
        </Press>
      </Enter>

      <Enter delay={180}>
        <View
          style={[{ borderRadius: 22, backgroundColor: colors.card, overflow: 'hidden' }, shadow]}
        >
          {rows.map((row, index) => (
            <Press
              key={row.label}
              onPress={row.onPress}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderTopWidth: index ? 1 : 0,
                borderTopColor: colors.line,
              }}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  backgroundColor: palette.light,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={row.icon} size={18} color={palette.deep} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.strong}>{row.label}</Text>
                <Text style={[type.small, { color: palette.muted }]} numberOfLines={1}>
                  {row.hint}
                </Text>
              </View>
              <Icon name="chevron-right" size={18} color={palette.muted} />
            </Press>
          ))}
        </View>
      </Enter>

      <Enter delay={240}>
        <Button
          label="Sair da conta"
          variant="ghost"
          icon="log-out"
          onPress={() => {
            signOut()
            router.replace('/')
          }}
        />
      </Enter>

      <Modal visible={panel !== null} transparent animationType="slide" onRequestClose={close}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(15,15,20,0.5)', justifyContent: 'flex-end' }}
          onPress={close}
        >
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
            {panel === 'data' && (
              <>
                <Text style={type.h2}>Meus dados</Text>
                <Field
                  label="Nome completo"
                  value={name}
                  onChangeText={setName}
                  palette={palette}
                />
                <Field
                  label="Celular"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  palette={palette}
                />
                <Text style={[type.small, { color: palette.muted }]}>
                  O e-mail é o seu acesso e não muda por aqui.
                </Text>
                <ErrorText>{message}</ErrorText>
                <Button
                  label={busy ? 'Salvando…' : 'Salvar'}
                  palette={palette}
                  disabled={busy}
                  onPress={async () => {
                    if (name.trim().length < 2) return setMessage('Informe seu nome.')
                    setBusy(true)
                    const failure = await saveProfile({ name, phone })
                    setBusy(false)
                    if (failure) return setMessage(failure)
                    close()
                  }}
                />
              </>
            )}
            {panel === 'password' && (
              <>
                <Text style={type.h2}>Acesso e senha</Text>
                <Field
                  label="Senha atual"
                  value={current}
                  onChangeText={setCurrent}
                  secureTextEntry
                  palette={palette}
                />
                <Field
                  label="Nova senha"
                  value={next}
                  onChangeText={setNext}
                  secureTextEntry
                  hint="Pelo menos 8 caracteres."
                  palette={palette}
                />
                <ErrorText>{message}</ErrorText>
                <Button
                  label={busy ? 'Alterando…' : 'Alterar senha'}
                  palette={palette}
                  disabled={busy}
                  onPress={async () => {
                    setBusy(true)
                    const failure = await changePassword(current, next)
                    setBusy(false)
                    if (failure) return setMessage(failure)
                    setCurrent('')
                    setNext('')
                    close()
                  }}
                />
              </>
            )}
            {panel === 'help' && (
              <>
                <Text style={type.h2}>Ajuda</Text>
                {faq.map(([question, answer]) => (
                  <View
                    key={question}
                    style={{
                      gap: 4,
                      paddingTop: 12,
                      borderTopWidth: 1,
                      borderTopColor: colors.line,
                    }}
                  >
                    <Text style={type.strong}>{question}</Text>
                    <Text style={[type.small, { color: palette.muted }]}>{answer}</Text>
                  </View>
                ))}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </TabPage>
  )
}
