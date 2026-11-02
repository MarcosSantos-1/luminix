import { Button, Card, Checkbox, Label } from '@heroui/react'
import { Banknote, Check, CircleHelp, Search } from 'lucide-react'
import { useRef, useState } from 'react'
import type { Payload } from './model'
import { formatMoney } from './model'
import { BlurDialog, ChoiceCard, GlassField, GlassSelect } from './ui'
import { serviceNeedsDeposit } from './deposit-policy'

function DepositServiceList({
  services,
  search,
  onToggle,
}: {
  services: Payload['services']
  search: string
  onToggle: (serviceId: string, selected: boolean) => void
}) {
  const visible = services
    .map((service, index) => ({ service, index }))
    .filter(({ service }) =>
      service.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')),
    )
    .sort((a, b) => {
      const selectedA = a.service.depositRequired === true ? 0 : 1
      const selectedB = b.service.depositRequired === true ? 0 : 1
      return selectedA - selectedB || a.index - b.index
    })
  const listRef = useRef<HTMLDivElement>(null)
  if (visible.length === 0) {
    return (
      <p className="ob2-copy">
        {services.length === 0
          ? 'Nenhum tratamento cadastrado ainda.'
          : 'Nenhum tratamento com esse nome.'}
      </p>
    )
  }
  return (
    <div className="ob2-deposit-list" ref={listRef}>
      {visible.map(({ service }) => (
        <Checkbox
          key={service.id}
          className={
            service.depositRequired ? 'ob2-deposit-service is-picked' : 'ob2-deposit-service'
          }
          isSelected={service.depositRequired === true}
          onChange={(selected) => {
            onToggle(service.id, selected)
            if (selected) listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        >
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Label>{service.name}</Label>
          </Checkbox.Content>
        </Checkbox>
      ))}
    </div>
  )
}

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
              <div className="ob2-deposit-picker" role="group" aria-label="Tratamentos com sinal">
                <GlassField
                  label="Buscar tratamento"
                  icon={<Search size={16} />}
                  value={search}
                  placeholder="Nome do tratamento"
                  onChange={setSearch}
                />
                <DepositServiceList
                  services={payload.services}
                  search={search}
                  onToggle={(serviceId, selected) =>
                    setPayload({
                      ...payload,
                      services: payload.services.map((item) =>
                        item.id === serviceId ? { ...item, depositRequired: selected } : item,
                      ),
                    })
                  }
                />
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
