import { Card, Checkbox, Label, Switch } from '@heroui/react'
import { Banknote, CalendarCheck, Check, ChevronDown, Percent, Search, Star } from 'lucide-react'
import Image from 'next/image'
import { useRef, useState, type ReactNode } from 'react'
import type { Payload, Service } from './model'
import { formatMoney } from './model'
import { ChoiceCard, GlassField, GlassSelect, type FieldErrors } from './ui'
import {
  isSpecialService,
  serviceNeedsDeposit,
  setServicesDeposit,
  withDepositEnabled,
} from './deposit-policy'
import { configuredEquipment, equipmentPresentation } from './special-equipment'
import './deposit-settings.css'

function SwitchControl({
  isSelected,
  label,
  onChange,
}: {
  isSelected: boolean
  label: string
  onChange: (selected: boolean) => void
}) {
  return (
    <Switch className="ob2-deposit-switch" isSelected={isSelected} onChange={onChange}>
      <Switch.Content>
        <Label>{label}</Label>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  )
}

function TypeHeader({
  icon,
  title,
  detail,
  badge,
  action,
}: {
  icon: ReactNode
  title: string
  detail: string
  badge?: string
  action?: ReactNode
}) {
  return (
    <div className="ob2-booking-type-head">
      <span className="ob2-booking-type-icon" aria-hidden>
        {icon}
      </span>
      <div className="ob2-booking-type-copy">
        <h3>
          {title}
          {badge ? <span className="ob2-booking-type-badge">{badge}</span> : null}
        </h3>
        <p>{detail}</p>
      </div>
      {action ? <div className="ob2-booking-type-action">{action}</div> : null}
    </div>
  )
}

function DepositExample({ percent, services }: { percent?: number; services: Service[] }) {
  const sample = services.find((service) => service.priceType === 'fixed' && service.priceCents > 0)
  const price = sample?.priceCents ?? 20000
  const deposit = percent == null ? null : Math.round((price * percent) / 100)
  return (
    <div className="ob2-deposit-example" aria-live="polite">
      <p className="ob2-deposit-example-title">
        Como fica para a cliente
        <span>
          {sample ? sample.name : 'Atendimento de exemplo'} · {formatMoney(price)}
        </span>
      </p>
      <div className="ob2-deposit-example-bar" aria-hidden>
        <b style={{ width: `${percent ?? 0}%` }} />
      </div>
      <div className="ob2-deposit-example-split">
        <div className="is-deposit">
          <small>Paga para reservar</small>
          <strong>{deposit == null ? '—' : formatMoney(deposit)}</strong>
        </div>
        <div>
          <small>Paga no dia</small>
          <strong>{deposit == null ? '—' : formatMoney(price - deposit)}</strong>
        </div>
      </div>
      <p className="ob2-deposit-example-foot">
        {deposit == null
          ? 'Escolha a porcentagem acima para ver a conta.'
          : `O total continua ${formatMoney(price)}. O sinal não é taxa extra.`}
      </p>
    </div>
  )
}

function SpecialEquipment({
  payload,
  setPayload,
}: {
  payload: Payload
  setPayload: (payload: Payload) => void
}) {
  const special = payload.services.filter(isSpecialService)
  const grouped = configuredEquipment(payload.services)
  const groupedIds = new Set(grouped.flatMap((group) => group.serviceIds))
  const loose = special.filter((service) => !groupedIds.has(service.id))
  const groups = [
    ...grouped,
    ...(loose.length
      ? [{ name: 'Outros tratamentos especiais', serviceIds: loose.map((s) => s.id) }]
      : []),
  ]
  const byId = new Map(payload.services.map((service) => [service.id, service]))
  const charged = special.filter((service) => service.depositRequired).length
  return (
    <section className="ob2-booking-type is-special" aria-label="Reserva especial">
      <TypeHeader
        icon={<Star size={20} />}
        title="Reserva especial"
        badge={`${charged} de ${special.length} com sinal`}
        detail="Aparelho alugado ou material preparado. Recomendamos cobrar sinal, com prazo maior para cancelar."
      />
      <ul className="ob2-deposit-machines">
        {groups.map((group) => {
          const items = group.serviceIds
            .map((id) => byId.get(id))
            .filter((item): item is Service => Boolean(item))
          const on = items.length > 0 && items.every((item) => item.depositRequired)
          const some = !on && items.some((item) => item.depositRequired)
          return (
            <li
              key={group.name}
              className={on ? 'ob2-deposit-machine is-on' : 'ob2-deposit-machine'}
            >
              <div className="ob2-deposit-machine-main">
                <span className="ob2-deposit-machine-art">
                  <Image
                    src={equipmentPresentation(group.name).image}
                    alt=""
                    width={112}
                    height={112}
                    sizes="56px"
                  />
                </span>
                <div className="ob2-deposit-machine-copy">
                  <strong>{group.name}</strong>
                  <small>
                    {on ? 'Cobra sinal' : some ? 'Sinal em parte dos tratamentos' : 'Sem sinal'}
                  </small>
                </div>
                <SwitchControl
                  isSelected={on}
                  label={on ? 'Cobrar sinal' : 'Não cobrar'}
                  onChange={(selected) =>
                    setPayload(setServicesDeposit(payload, group.serviceIds, selected))
                  }
                />
              </div>
              <details className="ob2-deposit-machine-services">
                <summary>
                  {items.length} {items.length === 1 ? 'tratamento' : 'tratamentos'} com este
                  aparelho
                  <ChevronDown size={16} aria-hidden />
                </summary>
                <ul>
                  {items.map((item) => (
                    <li key={item.id}>
                      {item.depositRequired ? <Check size={14} aria-hidden /> : <i aria-hidden />}
                      {item.name}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function RegularServices({
  payload,
  setPayload,
  regular,
}: {
  payload: Payload
  setPayload: (payload: Payload) => void
  regular: Service[]
}) {
  const picked = regular.filter((service) => service.depositRequired).length
  const [open, setOpen] = useState(picked > 0)
  const [search, setSearch] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const needle = search.trim().toLocaleLowerCase('pt-BR')
  const visible = regular
    .map((service, index) => ({ service, index }))
    .filter(({ service }) => service.name.toLocaleLowerCase('pt-BR').includes(needle))
    .sort(
      (a, b) =>
        Number(b.service.depositRequired === true) - Number(a.service.depositRequired === true) ||
        a.index - b.index,
    )
  return (
    <section className="ob2-booking-type" aria-label="Outros serviços com sinal">
      <TypeHeader
        icon={<Banknote size={20} />}
        title="Outros serviços com sinal"
        badge={open && picked ? `${picked} ${picked === 1 ? 'marcado' : 'marcados'}` : undefined}
        detail="Opcional. Para atendimentos longos, com preparo ou muita procura."
        action={
          <SwitchControl
            isSelected={open}
            label={open ? 'Escolher' : 'Não'}
            onChange={(selected) => {
              setOpen(selected)
              if (!selected && picked)
                setPayload(
                  setServicesDeposit(
                    payload,
                    regular.map((service) => service.id),
                    false,
                  ),
                )
            }}
          />
        }
      />
      {open ? (
        <div className="ob2-deposit-picker" role="group" aria-label="Serviços com sinal">
          <GlassField
            label="Buscar serviço"
            icon={<Search size={16} />}
            value={search}
            placeholder="Nome do serviço"
            onChange={setSearch}
          />
          {visible.length === 0 ? (
            <p className="ob2-copy">
              {regular.length === 0
                ? 'Nenhum outro serviço cadastrado.'
                : 'Nenhum serviço com esse nome.'}
            </p>
          ) : (
            <div className="ob2-deposit-list" ref={listRef}>
              {visible.map(({ service }) => (
                <Checkbox
                  key={service.id}
                  className={
                    service.depositRequired
                      ? 'ob2-deposit-service is-picked'
                      : 'ob2-deposit-service'
                  }
                  isSelected={service.depositRequired === true}
                  onChange={(selected) => {
                    setPayload(setServicesDeposit(payload, [service.id], selected))
                    if (selected) listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                >
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <Label>{service.name}</Label>
                    {service.priceType === 'fixed' && service.priceCents > 0 ? (
                      <small className="ob2-deposit-service-price">
                        {formatMoney(service.priceCents)}
                      </small>
                    ) : null}
                  </Checkbox.Content>
                </Checkbox>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}

function FreeServices({ services }: { services: Service[] }) {
  const names = services.slice(0, 3).map((service) => service.name)
  return (
    <section className="ob2-booking-type is-free" aria-label="Reserva gratuita">
      <TypeHeader
        icon={<CalendarCheck size={20} />}
        title="Reserva gratuita"
        badge={`${services.length} ${services.length === 1 ? 'serviço' : 'serviços'}`}
        detail={
          services.length
            ? `${names.join(' · ')}${services.length > 3 ? ` e mais ${services.length - 3}` : ''}.`
            : 'Todos os serviços estão com sinal.'
        }
      />
      <ul className="ob2-booking-facts">
        <li>
          <Check size={16} aria-hidden /> A cliente reserva sem pagar nada antes.
        </li>
        <li>
          <Check size={16} aria-hidden /> Cancelar ou faltar não gera cobrança.
        </li>
        <li>
          <Check size={16} aria-hidden /> Ideal para unhas, sobrancelhas e atendimentos rápidos.
        </li>
      </ul>
    </section>
  )
}

export function DepositSettings({
  payload,
  setPayload,
  fieldErrors = {},
}: {
  payload: Payload
  setPayload: (payload: Payload) => void
  fieldErrors?: FieldErrors
}) {
  const preferences = payload.preferences
  const enabled = (preferences.depositScope ?? 'none') !== 'none'
  const percent = preferences.depositPercent
  const special = payload.services.filter(isSpecialService)
  const regular = payload.services.filter((service) => !isSpecialService(service))
  const charged = payload.services.filter((service) => serviceNeedsDeposit(service, preferences))
  const free = payload.services.filter((service) => !serviceNeedsDeposit(service, preferences))
  return (
    <Card className="ob2-panel">
      <Card.Content className="ob2-form">
        <div className="ob2-rules-heading">
          <Banknote size={22} aria-hidden />
          <h2>Sinal para reservar</h2>
        </div>
        <p className="ob2-copy">
          Sinal é uma parte do preço paga antes, para garantir o horário. Não é taxa extra: o valor
          é descontado do preço final.
        </p>
        <div className="ob2-grid ob2-grid-payments">
          <ChoiceCard
            title="Não, por enquanto"
            detail="Todas as reservas sem pagamento antecipado"
            icon={<Check size={22} />}
            selected={!enabled}
            selection="single"
            onPress={() => setPayload(withDepositEnabled(payload, false))}
          />
          <ChoiceCard
            title="Sim, quero sinal"
            detail="Você escolhe quanto e em quais serviços"
            icon={<Banknote size={22} />}
            selected={enabled}
            selection="single"
            onPress={() => setPayload(withDepositEnabled(payload, true))}
          />
        </div>
        {!enabled && special.length > 0 ? (
          <p className="ob2-rule-example">
            Você tem {special.length}{' '}
            {special.length === 1 ? 'serviço especial' : 'serviços especiais'} com aparelho ou
            material preparado. Para eles, recomendamos pedir sinal.
          </p>
        ) : null}
        {enabled ? (
          <>
            <div className="ob2-deposit-percent">
              <GlassSelect
                label="Quanto do preço será pago como sinal?"
                required
                field="depositPercent"
                icon={<Percent size={18} />}
                placeholder="Escolha uma porcentagem"
                value={percent == null ? '' : String(percent)}
                options={[...new Set([10, 20, 25, 30, 50, ...(percent == null ? [] : [percent])])]
                  .sort((a, b) => a - b)
                  .map((value) => ({
                    id: String(value),
                    label: `${value}% do preço do atendimento`,
                  }))}
                error={fieldErrors.depositPercent}
                onChange={(value) =>
                  setPayload({
                    ...payload,
                    preferences: { ...preferences, depositPercent: Number(value) },
                  })
                }
              />
              <DepositExample percent={percent} services={charged} />
            </div>
            <div className="ob2-booking-types" data-field="depositServices">
              {special.length > 0 ? (
                <SpecialEquipment payload={payload} setPayload={setPayload} />
              ) : null}
              <RegularServices payload={payload} setPayload={setPayload} regular={regular} />
              {fieldErrors.depositServices ? (
                <p className="ob2-field-error" role="alert">
                  {fieldErrors.depositServices}
                </p>
              ) : null}
              <FreeServices services={free} />
            </div>
            <p className="ob2-copy">
              Pacotes de sessões não pedem sinal. Em Regras, você escolhe o que acontece com o sinal
              se a cliente cancelar em cima da hora ou faltar.
            </p>
          </>
        ) : null}
        <p className="ob2-copy">
          Configuração salva para o futuro agendamento. O Luminix ainda não cobra sinal nem confirma
          reservas por pagamento.{' '}
          {preferences.acceptInApp
            ? 'A cobrança pelo app depende da liberação do checkout.'
            : 'Fora do app, o recebimento e a conferência serão combinados diretamente com a cliente.'}
        </p>
      </Card.Content>
    </Card>
  )
}
