import { useRouter } from 'expo-router'
import { Text, View } from 'react-native'
import { useStore } from '../../src/store'
import { colors, fonts, paletteFor, radius, shadow } from '../../src/theme'
import { Button, Enter, Icon, Press, Rings, SpaceLogo, type, type IconName } from '../../src/ui'
import { TabPage } from '../../src/ui/space'

export default function Profile() {
  const router = useRouter()
  const { account, space, signOut } = useStore()
  if (!account || !space) return null
  const palette = paletteFor(space.theme)
  const initials = account.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  const rows: { icon: IconName; label: string; hint: string; onPress?: () => void }[] = [
    {
      icon: 'repeat',
      label: 'Trocar de espaço',
      hint: `${account.spaces.length} vinculado(s)`,
      onPress: () => router.push('/espacos'),
    },
    {
      icon: 'shield',
      label: 'Permissões do app',
      hint: 'Notificações, localização e câmera',
      onPress: () => router.push('/permissoes'),
    },
    { icon: 'clipboard', label: 'Ficha de anamnese', hint: 'Em breve no aplicativo' },
    { icon: 'help-circle', label: 'Ajuda', hint: 'Em breve no aplicativo' },
  ]
  return (
    <TabPage title="Perfil" kicker="Sua conta Luminix">
      <Enter delay={80}>
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
          <View
            style={{
              width: 70,
              height: 70,
              borderRadius: 35,
              backgroundColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: fonts.display, fontSize: 25, color: palette.deep }}>
              {initials}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.h2, { color: '#fff' }]}>{account.name}</Text>
            <Text style={[type.small, { color: 'rgba(255,255,255,0.74)' }]}>{account.email}</Text>
          </View>
        </View>
      </Enter>

      <Enter delay={160}>
        <View
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
          <SpaceLogo space={space} size={46} />
          <View style={{ flex: 1 }}>
            <Text style={type.strong} numberOfLines={1}>
              {space.name}
            </Text>
            <Text style={[type.small, { color: palette.muted }]}>Espaço atual</Text>
          </View>
        </View>
      </Enter>

      <Enter delay={240}>
        <View
          style={[{ borderRadius: 22, backgroundColor: colors.card, overflow: 'hidden' }, shadow]}
        >
          {rows.map((row, index) => (
            <Press
              key={row.label}
              onPress={row.onPress}
              disabled={!row.onPress}
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
                <Text style={[type.small, { color: palette.muted }]}>{row.hint}</Text>
              </View>
              {row.onPress && <Icon name="chevron-right" size={18} color={palette.muted} />}
            </Press>
          ))}
        </View>
      </Enter>

      <Enter delay={320} style={{ borderRadius: radius.button }}>
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
    </TabPage>
  )
}
