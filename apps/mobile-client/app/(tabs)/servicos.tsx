import { useMemo, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { durationLabel, priceLabel } from '../../src/api'
import { useStore } from '../../src/store'
import { colors, fonts, paletteFor, radius, shadow } from '../../src/theme'
import { Enter, Field, Icon, Press, type } from '../../src/ui'
import { ComingSoon, TabPage, useServices } from '../../src/ui/space'

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Services() {
  const { space } = useStore()
  const services = useServices()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const palette = paletteFor(space?.theme)
  const categories = useMemo(
    () => [...new Set((services ?? []).map((item) => item.category))],
    [services],
  )
  const visible = (services ?? []).filter(
    (item) =>
      (!category || item.category === category) &&
      fold(`${item.name} ${item.category}`).includes(fold(query.trim())),
  )

  return (
    <TabPage title="Serviços">
      <Field
        label="Buscar"
        value={query}
        onChangeText={setQuery}
        placeholder="Nome ou categoria"
        palette={palette}
        right={
          <View style={{ paddingRight: 10 }}>
            <Icon name="search" size={19} color={palette.muted} />
          </View>
        }
      />
      {categories.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -20 }}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
        >
          {['', ...categories].map((name) => {
            const active = category === name
            return (
              <Press
                key={name || 'all'}
                onPress={() => setCategory(name)}
                selected={active}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: radius.pill,
                  backgroundColor: active ? palette.deep : colors.card,
                  borderWidth: active ? 0 : 1,
                  borderColor: colors.line,
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.bodySemi,
                    fontSize: 13.5,
                    color: active ? '#fff' : colors.ink,
                  }}
                >
                  {name || 'Todos'}
                </Text>
              </Press>
            )
          })}
        </ScrollView>
      )}
      {services !== null && visible.length === 0 && (
        <ComingSoon
          icon="search"
          title="Nenhum serviço encontrado"
          body="Tente outro termo ou outra categoria."
        />
      )}
      {visible.map((service, index) => (
        <Enter key={service.id} delay={Math.min(index, 6) * 60}>
          <View
            style={[
              {
                flexDirection: 'row',
                gap: 14,
                alignItems: 'center',
                padding: 14,
                borderRadius: 24,
                backgroundColor: colors.card,
              },
              shadow,
            ]}
          >
            <View
              style={{
                width: 62,
                height: 62,
                borderRadius: 20,
                backgroundColor: palette.light,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: fonts.display, fontSize: 26, color: palette.accent }}>
                {service.name.slice(0, 1)}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.small, { color: palette.muted }]}>{service.category}</Text>
              <Text
                style={{
                  fontFamily: fonts.display,
                  fontSize: 16.5,
                  lineHeight: 20,
                  color: colors.ink,
                }}
              >
                {service.name}
              </Text>
              <Text style={[type.small, { color: palette.muted }]}>
                {durationLabel(service.durationMinutes)}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: fonts.bodyBold,
                fontSize: 13.5,
                color: palette.deep,
                maxWidth: 104,
                textAlign: 'right',
              }}
            >
              {priceLabel(service)}
            </Text>
          </View>
        </Enter>
      ))}
    </TabPage>
  )
}
