import { useState } from 'react'
import { Text, View } from 'react-native'
import { dateLabel } from '../../src/format'
import { displayStatus, useStore } from '../../src/store'
import { colors, fonts, radius, shadow } from '../../src/theme'
import { Enter, Icon, Press, Rings, type, type IconName } from '../../src/ui'
import { EmptyState, StatusBadge, TabPage, money, usePalette } from '../../src/ui/space'

const methodIcon: Record<string, IconName> = { pix: 'zap', card: 'credit-card', local: 'home' }
const methodLabel = { pix: 'Pix (simulado)', card: 'Cartão (simulado)', local: 'No espaço' }
const paymentLabel = { paid: 'Pago', pending: 'A pagar no espaço', refunded: 'Estornado' }

export default function History() {
  const palette = usePalette()
  const { appointments, payments } = useStore()
  const [tab, setTab] = useState<'visits' | 'payments'>('visits')
  const visits = (appointments ?? [])
    .filter((item) => ['done', 'cancelled'].includes(displayStatus(item)))
    .sort((a, b) => b.start.localeCompare(a.start))
  const done = visits.filter((item) => displayStatus(item) === 'done')
  const spent = payments
    .filter((item) => item.status === 'paid')
    .reduce((sum, item) => sum + item.amountCents, 0)

  const stats = [
    { label: 'Atendimentos', value: String(done.length) },
    { label: 'Total pago', value: money(spent) },
    {
      label: 'Última visita',
      value: done[0] ? dateLabel(done[0].start).split(',')[1].trim() : '—',
    },
  ]

  return (
    <TabPage title="Histórico">
      <Enter delay={60} style={{ flexDirection: 'row', gap: 10 }}>
        {stats.map((stat, index) => (
          <View
            key={stat.label}
            style={[
              {
                flex: 1,
                minHeight: 92,
                padding: 14,
                borderRadius: 20,
                justifyContent: 'space-between',
                overflow: 'hidden',
                backgroundColor: index === 0 ? palette.deep : colors.card,
              },
              shadow,
            ]}
          >
            {index === 0 && <Rings />}
            <Text
              style={[
                type.small,
                { color: index === 0 ? 'rgba(255,255,255,0.75)' : palette.muted },
              ]}
            >
              {stat.label}
            </Text>
            <Text
              style={{
                fontFamily: fonts.display,
                fontSize: 18,
                color: index === 0 ? '#fff' : colors.ink,
              }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {stat.value}
            </Text>
          </View>
        ))}
      </Enter>

      <View
        style={{ flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: '#e6e6ec' }}
      >
        {(
          [
            ['visits', 'Atendimentos'],
            ['payments', 'Pagamentos'],
          ] as const
        ).map(([value, label]) => (
          <View key={value} style={{ flex: 1 }}>
            <Press
              onPress={() => setTab(value)}
              selected={tab === value}
              style={[
                { minHeight: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
                tab === value && { backgroundColor: colors.card },
              ]}
            >
              <Text
                style={{
                  fontFamily: fonts.bodySemi,
                  fontSize: 14,
                  color: tab === value ? colors.ink : palette.muted,
                }}
              >
                {label}
              </Text>
            </Press>
          </View>
        ))}
      </View>

      {tab === 'visits' &&
        (visits.length ? (
          visits.map((item, index) => (
            <Enter key={item.id} delay={Math.min(index, 6) * 50}>
              <View
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
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    backgroundColor: palette.light,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="check-circle" size={18} color={palette.deep} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={type.strong} numberOfLines={1}>
                    {item.serviceName}
                  </Text>
                  <Text style={[type.small, { color: palette.muted }]}>
                    {dateLabel(item.start)} · {item.start.slice(11, 16)}
                    {item.professionalName ? ` · ${item.professionalName}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  {item.priceCents > 0 && <Text style={type.strong}>{money(item.priceCents)}</Text>}
                  <StatusBadge appointment={item} />
                </View>
              </View>
            </Enter>
          ))
        ) : (
          <EmptyState
            icon="clock"
            title="Ainda sem atendimentos"
            body="Depois da sua primeira visita, ela fica registrada aqui."
          />
        ))}

      {tab === 'payments' &&
        (payments.length ? (
          payments.map((item, index) => (
            <Enter key={item.id} delay={Math.min(index, 6) * 50}>
              <View
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
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    backgroundColor: palette.light,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name={methodIcon[item.method]} size={18} color={palette.deep} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={type.strong} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text style={[type.small, { color: palette.muted }]}>
                    {methodLabel[item.method]} · {new Date(item.at).toLocaleDateString('pt-BR')}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={type.strong}>{money(item.amountCents)}</Text>
                  <View
                    style={{
                      paddingHorizontal: 9,
                      paddingVertical: 4,
                      borderRadius: radius.pill,
                      backgroundColor: item.status === 'paid' ? colors.okBg : palette.light,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: fonts.bodyBold,
                        fontSize: 11,
                        color: item.status === 'paid' ? colors.ok : palette.deep,
                      }}
                    >
                      {paymentLabel[item.status]}
                    </Text>
                  </View>
                </View>
              </View>
            </Enter>
          ))
        ) : (
          <EmptyState
            icon="credit-card"
            title="Nenhum pagamento"
            body="Os valores dos seus atendimentos aparecem aqui."
          />
        ))}
    </TabPage>
  )
}
