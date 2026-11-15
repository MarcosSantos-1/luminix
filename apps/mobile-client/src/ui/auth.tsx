import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useStore } from '../store'
import { colors, fonts, palettes } from '../theme'
import { Button, Enter, ErrorText, Field, Icon, Press, Rings, type } from './index'

export function AuthScreen({ mode }: { mode: 'entrar' | 'cadastro' }) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { signIn, signUp } = useStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const signingUp = mode === 'cadastro'
  const palette = palettes.luminix

  async function submit() {
    setBusy(true)
    const problem = signingUp
      ? !accepted
        ? 'Aceite os termos para criar a conta.'
        : await signUp({ name, email, password })
      : await signIn(email, password)
    setBusy(false)
    if (problem) return setError(problem)
    // The gate decides the next step: permissions, space or home.
    router.replace('/')
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: palette.deep }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <View
          style={{
            paddingTop: insets.top + 18,
            paddingHorizontal: 24,
            paddingBottom: 60,
            gap: 30,
            overflow: 'hidden',
          }}
        >
          <Rings />
          <Text
            style={{ fontFamily: fonts.display, fontSize: 22, color: '#fff', letterSpacing: -0.6 }}
          >
            Luminix
          </Text>
          <Enter>
            <Text style={[type.h1, { color: '#fff', fontSize: 34, lineHeight: 38 }]}>
              {signingUp ? 'Crie sua conta em um minuto.' : 'Que bom ver você de novo.'}
            </Text>
            <Text style={[type.body, { color: 'rgba(255,255,255,0.74)', marginTop: 10 }]}>
              Uma conta vale para todos os espaços que você frequenta.
            </Text>
          </Enter>
        </View>

        <Enter
          delay={120}
          from={40}
          style={{
            flex: 1,
            marginTop: -30,
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
            backgroundColor: colors.bg,
            padding: 24,
            paddingBottom: insets.bottom + 28,
            gap: 16,
          }}
        >
          <Text style={type.h2}>{signingUp ? 'Criar conta' : 'Entrar'}</Text>
          {signingUp && (
            <Field
              label="Nome completo"
              value={name}
              onChangeText={setName}
              autoComplete="name"
              textContentType="name"
            />
          )}
          <Field
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
          />
          <Field
            label="Senha"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!visible}
            autoCapitalize="none"
            textContentType={signingUp ? 'newPassword' : 'password'}
            hint={signingUp ? 'Pelo menos 8 caracteres.' : undefined}
            onSubmitEditing={submit}
            right={
              <Press
                onPress={() => setVisible(!visible)}
                label={visible ? 'Ocultar senha' : 'Mostrar senha'}
                style={{ padding: 10 }}
              >
                <Icon name={visible ? 'eye-off' : 'eye'} size={19} color={palette.muted} />
              </Press>
            }
          />
          {signingUp && (
            <Press
              onPress={() => setAccepted(!accepted)}
              selected={accepted}
              style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: accepted ? 0 : 1.5,
                  borderColor: colors.line,
                  backgroundColor: accepted ? palette.deep : colors.card,
                }}
              >
                {accepted && <Icon name="check" size={15} color="#fff" />}
              </View>
              <Text style={[type.small, { flex: 1, color: palette.muted }]}>
                Li e aceito os Termos e a Política de Privacidade do Luminix.
              </Text>
            </Press>
          )}
          <ErrorText>{error}</ErrorText>
          <Button
            label={signingUp ? 'Criar conta' : 'Entrar'}
            icon="arrow-right"
            palette={palette}
            disabled={busy}
            onPress={submit}
          />
          <Link
            href={signingUp ? '/entrar' : '/cadastro'}
            replace
            style={{ textAlign: 'center', paddingVertical: 6 }}
          >
            <Text style={[type.body, { color: palette.muted }]}>
              {signingUp ? 'Já tem conta? ' : 'Primeira vez aqui? '}
              <Text style={{ fontFamily: fonts.bodyBold, color: colors.ink }}>
                {signingUp ? 'Entrar' : 'Criar conta'}
              </Text>
            </Text>
          </Link>
          <Text style={[type.small, { color: palette.muted, textAlign: 'center' }]}>
            Versão de avaliação: a conta fica salva só neste aparelho.
          </Text>
        </Enter>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
