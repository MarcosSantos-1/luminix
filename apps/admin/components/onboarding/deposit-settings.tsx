import { Button, Card, Checkbox } from '@heroui/react'
import { Banknote, Check, CircleHelp } from 'lucide-react'
import { useState } from 'react'
import type { Payload } from './model'
import { formatMoney } from './model'
import { BlurDialog, ChoiceCard, GlassField, GlassSelect } from './ui'
import { serviceNeedsDeposit } from './deposit-policy'

export function DepositSettings({
  payload,
  setPayload,
}: {
  payload: Payload
  setPayload: (payload: Payload) => void
}) {
  const [thresholdText, setThresholdText] = useState(
    String((payload.preferences.depositThresholdCents ?? 30000) / 100).replace('.', ','),
  )
  const [help, setHelp] = useState(false)
  const [search, setSearch] = useState('')
  const preferences = payload.preferences
  const scope = preferences.depositScope ?? 'none'
  const percent = preferences.depositPercent ?? 20
  const threshold = preferences.depositThresholdCents ?? 30000
  const update = (patch: Partial<Payload['preferences']>) => {
    // An unfinished amount must not block continuing after choosing another scope.
    if (
      patch.depositScope &&
      patch.depositScope !== 'threshold' &&
      (threshold < 1 || threshold > 100000000)
    ) {
      patch = { ...patch, depositThresholdCents: 30000 }
      setThresholdText('300')
    }
    setPayload({ ...payload, preferences: { ...preferences, ...patch } })
  }
  const count = payload.services.filter((service) =>
    serviceNeedsDeposit(service, preferences),
  ).length
  return (
    <Card className="ob2-panel">
      <Card.Content className="ob2-form">
        <div className="ob2-rules-heading">
          <Banknote size={22} aria-hidden />
          <h2>Sinal para reservar</h2>
          <Button
            variant="ghost"
            isIconOnly
            aria-label="O que é sinal?"
            onPress={() => setHelp(true)}
          >
            <CircleHelp size={20} />
          </Button>
        </div>
        <p className="ob2-copy">
          Quer combinar um pagamento antecipado para reservar o atendimento? Esse valor é descontado
          do preço final.
        </p>
        <div className="ob2-grid ob2-grid-payments">
          <ChoiceCard
            title="Não, por enquanto"
            detail="Começar sem pedir sinal"
            icon={<Check size={22} />}
            selected={scope === 'none'}
            selection="single"
            onPress={() => update({ depositScope: 'none' })}
          />
          <ChoiceCard
            title="Sim, quero sinal"
            detail="Escolher tratamentos e percentual"
            icon={<Banknote size={22} />}
            selected={scope !== 'none'}
            selection="single"
            onPress={() => update({ depositScope: scope === 'none' ? 'selected' : scope })}
          />
        </div>
        {scope !== 'none' && (
          <>
            <GlassSelect
              label="Em quais atendimentos?"
              value={scope}
              options={[
                { id: 'selected', label: 'Escolher tratamentos' },
                { id: 'special', label: 'Somente especiais com locação' },
                { id: 'threshold', label: 'Acima de um valor' },
                { id: 'all', label: 'Todos os tratamentos avulsos' },
              ]}
              onChange={(value) =>
                update({ depositScope: value as Payload['preferences']['depositScope'] })
              }
            />
            {scope === 'selected' && (
              <div className="ob2-form" role="group" aria-label="Tratamentos com sinal">
                <GlassField label="Buscar tratamento" value={search} onChange={setSearch} />
                <div className="ob2-form" style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {payload.services
                    .filter((service) =>
                      service.name
                        .toLocaleLowerCase('pt-BR')
                        .includes(search.toLocaleLowerCase('pt-BR')),
                    )
                    .map((service) => (
                      <Checkbox
                        key={service.id}
                        isSelected={service.depositRequired === true}
                        onChange={(selected) =>
                          setPayload({
                            ...payload,
                            services: payload.services.map((item) =>
                              item.id === service.id
                                ? { ...item, depositRequired: selected }
                                : item,
                            ),
                          })
                        }
                      >
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        <Checkbox.Content>{service.name}</Checkbox.Content>
                      </Checkbox>
                    ))}
                </div>
              </div>
            )}
            {scope === 'threshold' && (
              <GlassField
                label="Pedir sinal quando o preço for maior que (R$)"
                inputMode="decimal"
                value={thresholdText}
                onChange={(value) => {
                  if (/^\d*(?:[,.]\d{0,2})?$/.test(value)) {
                    setThresholdText(value)
                    update({
                      depositThresholdCents: Math.round(Number(value.replace(',', '.')) * 100) || 0,
                    })
                  }
                }}
                error={
                  threshold < 1 || threshold > 100000000
                    ? 'Informe um valor entre R$ 0,01 e R$ 1.000.000.'
                    : undefined
                }
              />
            )}
            <GlassSelect
              label="Qual parte do preço será paga como sinal?"
              value={String(percent)}
              options={[...new Set([10, 20, 25, 30, 50, percent])]
                .sort((a, b) => a - b)
                .map((value) => ({
                  id: String(value),
                  label: `${value}% do preço do atendimento`,
                }))}
              onChange={(value) => update({ depositPercent: Number(value) })}
            />
            <p className="ob2-rule-example">
              Exemplo do cálculo, quando houver sinal: em R$ 200, {formatMoney(200 * percent)} de
              sinal e {formatMoney(20000 - 200 * percent)} restantes. O total continua R$ 200.
            </p>
            <p className="ob2-copy">
              {count} tratamento(s) com preço definido se enquadram agora.{' '}
              {scope === 'threshold'
                ? 'Preços “a partir de” ou sob orçamento dependem do valor final combinado.'
                : ''}{' '}
              {count === 0
                ? 'Nenhum tratamento será marcado para sinal enquanto não se enquadrar na sua escolha.'
                : ''}
            </p>
            <p className="ob2-copy">
              Pacotes de sessões não entram nesta regra. Em Regras, você escolhe o que acontece se a
              cliente cancelar, remarcar ou faltar.
            </p>
          </>
        )}
        <p className="ob2-copy">
          Configuração salva para o futuro agendamento. O Luminix ainda não cobra sinal nem confirma
          reservas por pagamento.{' '}
          {preferences.acceptInApp
            ? 'A cobrança pelo app depende da liberação do checkout.'
            : 'Fora do app, o recebimento e a conferência serão combinados diretamente com a cliente.'}
        </p>
      </Card.Content>
      <BlurDialog
        isOpen={help}
        onOpenChange={setHelp}
        title="O que é sinal?"
        size="md"
        footer={<Button onPress={() => setHelp(false)}>Entendi</Button>}
      >
        <p>
          É uma parte do preço paga antes do atendimento para reservar o horário. Não é uma taxa
          extra nem uma multa. O restante é pago depois, conforme o combinado.
        </p>
        <p>
          Você pode escolher tratamentos que exigem preparo ou locação de aparelho. Pedir sinal não
          significa ficar automaticamente com o dinheiro em caso de cancelamento; isso é definido
          separadamente em Regras.
        </p>
      </BlurDialog>
    </Card>
  )
}
