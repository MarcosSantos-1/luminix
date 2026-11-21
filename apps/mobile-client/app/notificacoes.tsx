import { useFocusEffect, useRouter } from 'expo-router'
import { ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { timeAgo } from '../src/format'
import { useStore } from '../src/store'
import { colors, fonts, shadow } from '../src/theme'
import { Enter, Icon, Press, type } from '../src/ui'
import { EmptyState, usePalette } from '../src/ui/space'

export default function Notices() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const { notices, unread, markRead, refreshNotices } = useStore()
  useFocusEffect(refreshNotices)
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        padding: 20,
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 30,
        gap: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Press
          onPress={() => router.back()}
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
        <View style={{ flex: 1 }}>
          <Text style={[type.small, { color: palette.muted }]}>
            {unread ? `${unread} não ${unread === 1 ? 'lida' : 'lidas'}` : 'Tudo em dia'}
          </Text>
          <Text style={type.h1}>Notificações</Text>
        </View>
      </View>
      {unread > 0 && (
        <Press onPress={() => markRead()} style={{ alignSelf: 'flex-start' }}>
          <Text style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: palette.accent }}>
            Marcar todas como lidas
          </Text>
        </Press>
      )}
      {notices.length ? (
        notices.map((item, index) => (
          <Enter key={item.id} delay={Math.min(index, 8) * 50}>
            <Press
              onPress={() => {
                markRead(item.id)
                if (item.kind === 'booking') router.push('/agenda')
              }}
              style={[
                {
                  flexDirection: 'row',
                  gap: 12,
                  padding: 14,
                  borderRadius: 20,
                  backgroundColor: colors.card,
                  borderLeftWidth: item.read ? 0 : 3,
                  borderLeftColor: palette.accent,
                },
                shadow,
              ]}
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
                <Icon
                  name={
                    item.kind === 'booking' ? 'calendar' : item.kind === 'promo' ? 'tag' : 'home'
                  }
                  size={18}
                  color={palette.deep}
                />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.strong, !item.read && { fontFamily: fonts.bodyBold }]}>
                  {item.title}
                </Text>
                <Text style={[type.small, { color: palette.muted }]}>{item.body}</Text>
              </View>
              <Text style={[type.small, { color: palette.muted, fontSize: 12 }]}>
                {timeAgo(item.at)}
              </Text>
            </Press>
          </Enter>
        ))
      ) : (
        <EmptyState
          icon="bell"
          title="Nenhuma notificação"
          body="Confirmações, lembretes e avisos do espaço aparecem aqui."
        />
      )}
    </ScrollView>
  )
}
