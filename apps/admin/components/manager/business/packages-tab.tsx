'use client'

import { Button } from '@heroui/react'
import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  Sparkles,
  TrendingDown,
} from 'lucide-react'
import { useState } from 'react'
import { maskMoney, SearchInput, TextInputField } from '@/components/ui/fields'
import { QuickModal } from '../quick-modal'
import { ClinicApiError, type ClinicApi } from '../settings/clinic-api'
import { StatusPill } from '../settings/settings-kit'
import type { Service } from './catalog-model'
import { money, moneyInput, parseMoney } from './format'
import { serviceIcon } from './service-icons'

type Item = { serviceId: string; sessions: number }
export type CatalogPackage = {
  id: string
  serviceId: string
  name: string
  /** "combo": several services; "sessions": N sessions of one. */
  kind?: 'sessions' | 'combo'
  items?: Item[]
  /** Combo: how long each visit takes (every service of it, same day). */
  durationMinutes?: number | null
  sessions: number
  priceCents: number
  validityDays: number | null
  status: 'active' | 'archived'
  sold: number
  activeSold: number
}

const validityOptions = [
  { id: null, label: 'Sem validade', emoji: '♾️' },
  { id: 30, label: '30 dias', emoji: '🗓️' },
  { id: 60, label: '60 dias', emoji: '🗓️' },
  { id: 90, label: '3 meses', emoji: '📆' },
  { id: 180, label: '6 meses', emoji: '📆' },
  { id: 365, label: '1 ano', emoji: '🎯' },
]

const comboDurations = [30, 45, 60, 75, 90, 120, 150, 180, 240]
const minutesLabel = (minutes: number) =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? `${String(minutes % 60).padStart(2, '0')}` : ''}`
    : `${minutes} min`

const itemsOf = (item: CatalogPackage): Item[] =>
  item.items?.length ? item.items : [{ serviceId: item.serviceId, sessions: item.sessions }]

/** Sum of the services at their own price ("avulso"). */
function fullPrice(items: Item[], services: Service[]) {
  return items.reduce(
    (sum, item) =>
      sum +
      (services.find((service) => service.id === item.serviceId)?.priceCents ?? 0) * item.sessions,
    0,
  )
}

/**
 * Pacotes: um combo de tratamentos diferentes (o padrão) ou várias sessões de um mesmo
 * tratamento, por um preço fechado. Vendidos na ficha da cliente; cada agendamento usa uma
 * sessão do serviço certo.
 */
export function PackagesTab({
  api,
  services,
  packages,
  canManage,
  onChanged,
}: {
  api: ClinicApi
  services: Service[]
  packages: CatalogPackage[]
  canManage: boolean
  onChanged: (message: string) => void
}) {
  const [editing, setEditing] = useState<CatalogPackage | null>(null)
  const [busy, setBusy] = useState('')
  const active = services.filter(
    (service) => service.status === 'active' && service.priceType !== 'quote',
  )
  const serviceOf = (id: string) => services.find((service) => service.id === id)

  async function setStatus(item: CatalogPackage, status: 'active' | 'archived') {
    setBusy(item.id)
    try {
      await api.post(`catalog/packages/${item.id}/status`, { status })
      onChanged(
        status === 'archived' ? `${item.name} foi pausado.` : `${item.name} voltou a ser vendido.`,
      )
    } catch {
      onChanged('Não foi possível alterar o pacote.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="biz-tab-body">
      <div className="biz-tab-intro">
        <span className="biz-tab-intro-icon" aria-hidden>
          <Layers size={22} />
        </span>
        <div>
          <strong>Pacotes e combos</strong>
          <p>
            Junte tratamentos diferentes num combo ou venda várias sessões de um mesmo tratamento.
            Na ficha da cliente você registra a venda e cada agendamento usa uma sessão.
          </p>
        </div>
        {canManage && active.length ? (
          <Button
            onPress={() =>
              setEditing({
                id: crypto.randomUUID(),
                serviceId: '',
                name: '',
                kind: 'combo',
                items: [],
                sessions: 0,
                priceCents: 0,
                validityDays: 180,
                status: 'active',
                sold: 0,
                activeSold: 0,
              })
            }
          >
            <Plus size={16} aria-hidden /> Novo pacote
          </Button>
        ) : null}
      </div>

      {packages.length ? (
        <ul className="biz-grid biz-packs">
          {packages.map((item) => {
            const lines = itemsOf(item)
            const first = serviceOf(lines[0]?.serviceId ?? '')
            const Icon = serviceIcon(first?.category ?? '', first?.name ?? '')
            const combo = item.kind === 'combo' || lines.length > 1
            // A combo visit does every service once; the full price is all of them, each visit.
            const full = combo
              ? fullPrice(
                  lines.map((line) => ({ ...line, sessions: 1 })),
                  services,
                ) * item.sessions
              : fullPrice(lines, services)
            const saving =
              full > item.priceCents ? Math.round(100 - (item.priceCents * 100) / full) : 0
            return (
              <li
                key={item.id}
                className={`biz-tile biz-pack${item.status === 'archived' ? ' is-muted' : ''}`}
              >
                <div className="biz-tile-head">
                  <span className="biz-tile-icon" aria-hidden>
                    <Icon size={20} />
                  </span>
                  <div className="biz-tile-title">
                    <strong title={item.name}>{item.name}</strong>
                    <span className="biz-row-meta">
                      {combo ? 'Combo' : (first?.name ?? 'Serviço removido')}
                    </span>
                  </div>
                  <div className="biz-price">
                    {saving ? <s>{money(full)}</s> : null}
                    <strong>{money(item.priceCents)}</strong>
                  </div>
                </div>
                {combo ? (
                  <div className="pk-combo">
                    <span className="pk-combo-count">
                      {item.sessions} {item.sessions === 1 ? 'sessão' : 'sessões'}
                      {item.durationMinutes ? ` · ${minutesLabel(item.durationMinutes)} cada` : ''}
                    </span>
                    <ul className="pk-lines">
                      {lines.map((line) => (
                        <li key={line.serviceId}>
                          <span>+</span> {serviceOf(line.serviceId)?.name ?? 'Serviço'}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="biz-pack-sessions" aria-label={`${item.sessions} sessões`}>
                    {Array.from({ length: Math.min(item.sessions, 12) }, (_, index) => (
                      <i key={index} />
                    ))}
                    {item.sessions > 12 ? <em>+{item.sessions - 12}</em> : null}
                    <span>
                      {item.sessions} sessões · {money(Math.round(item.priceCents / item.sessions))}{' '}
                      cada
                    </span>
                  </div>
                )}
                <ul className="biz-tile-facts">
                  {saving ? (
                    <li>
                      <TrendingDown size={13} aria-hidden /> {saving}% mais barato que avulso
                    </li>
                  ) : null}
                  <li>
                    <CalendarClock size={13} aria-hidden />{' '}
                    {item.validityDays ? `Vale ${item.validityDays} dias` : 'Sem validade'}
                  </li>
                  <li>
                    <Sparkles size={13} aria-hidden /> {item.sold}{' '}
                    {item.sold === 1 ? 'vendido' : 'vendidos'}
                    {item.activeSold ? ` · ${item.activeSold} em uso` : ''}
                  </li>
                </ul>
                <div className="biz-tags">
                  {item.status === 'archived' ? <StatusPill tone="off">Pausado</StatusPill> : null}
                </div>
                {canManage ? (
                  <div className="biz-tile-actions">
                    <Button size="sm" variant="secondary" onPress={() => setEditing(item)}>
                      <Pencil size={14} aria-hidden /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant={item.status === 'archived' ? 'primary' : 'ghost'}
                      isDisabled={busy === item.id}
                      onPress={() =>
                        void setStatus(item, item.status === 'active' ? 'archived' : 'active')
                      }
                    >
                      {item.status === 'active' ? (
                        <>
                          <Pause size={14} aria-hidden /> Pausar
                        </>
                      ) : (
                        <>
                          <Play size={14} aria-hidden /> Despausar
                        </>
                      )}
                    </Button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="biz-empty-hero">
          <Layers size={30} aria-hidden />
          <strong>Nenhum pacote ainda</strong>
          <p>
            Exemplos: “Combo noiva” com maquiagem, cabelo e unhas, ou “Depilação a laser · 10
            sessões”. A cliente paga uma vez e você acompanha o saldo na ficha dela.
          </p>
        </div>
      )}

      {editing ? (
        <PackageEditor
          key={editing.id}
          api={api}
          initial={editing}
          isNew={!packages.some((item) => item.id === editing.id)}
          services={active}
          onClose={(message) => {
            setEditing(null)
            if (message) onChanged(message)
          }}
        />
      ) : null}
    </div>
  )
}

type Step = 'kind' | 'items' | 'price' | 'finish'

function Counter({
  value,
  min,
  label,
  onChange,
}: {
  value: number
  min: number
  label: string
  onChange: (value: number) => void
}) {
  return (
    <div className="pk-counter">
      <button
        type="button"
        aria-label={`Menos sessões de ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus size={15} />
      </button>
      <output aria-label={`Sessões de ${label}`}>{value}</output>
      <button
        type="button"
        aria-label={`Mais sessões de ${label}`}
        disabled={value >= 100}
        onClick={() => onChange(Math.min(100, value + 1))}
      >
        <Plus size={15} />
      </button>
    </div>
  )
}

/**
 * Novo pacote, uma etapa por vez (cabe no celular): tipo, o que entra, preço (o total avulso
 * aparece riscado dentro do campo quando há desconto; dá para digitar o valor ou a
 * porcentagem) e, por fim, validade e nome.
 */
function PackageEditor({
  api,
  initial,
  isNew,
  services,
  onClose,
}: {
  api: ClinicApi
  initial: CatalogPackage
  isNew: boolean
  services: Service[]
  onClose: (message?: string) => void
}) {
  const startItems = isNew ? [] : itemsOf(initial)
  const [kind, setKind] = useState<'combo' | 'sessions'>(
    initial.kind ?? (startItems.length > 1 ? 'combo' : 'sessions'),
  )
  const [items, setItems] = useState<Item[]>(startItems)
  // Combo: visits (each one does every service) and how long a visit takes.
  const [visits, setVisits] = useState(
    !isNew && (initial.kind === 'combo' || startItems.length > 1) ? initial.sessions : 5,
  )
  const [duration, setDuration] = useState<number | null>(initial.durationMinutes ?? null)
  const [validity, setValidity] = useState<number | null>(initial.validityDays)
  const [price, setPrice] = useState(isNew ? '' : moneyInput(Math.round(initial.priceCents)))
  const [priceTouched, setPriceTouched] = useState(!isNew)
  const [percent, setPercent] = useState('')
  const [name, setName] = useState(initial.name)
  const [nameTouched, setNameTouched] = useState(!isNew)
  const [query, setQuery] = useState('')
  const steps: Step[] = isNew ? ['kind', 'items', 'price', 'finish'] : ['items', 'price', 'finish']
  const [step, setStep] = useState<Step>(steps[0])
  const position = steps.indexOf(step)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const serviceOf = (id: string) => services.find((service) => service.id === id)
  const full =
    kind === 'combo'
      ? fullPrice(
          items.map((item) => ({ ...item, sessions: 1 })),
          services,
        ) * visits
      : fullPrice(items, services)
  // Default visit length: the services one after the other.
  const sumMinutes = items.reduce(
    (sum, item) => sum + (serviceOf(item.serviceId)?.durationMinutes ?? 0),
    0,
  )
  const visitMinutes = duration ?? sumMinutes
  const typed = parseMoney(price)
  // Without a price typed yet, the package costs the full sum (no discount).
  const cents = priceTouched ? typed : full
  const discount =
    cents != null && full > 0 && cents < full ? Math.round(100 - (cents * 100) / full) : 0
  const total = kind === 'combo' ? visits : items.reduce((sum, item) => sum + item.sessions, 0)
  const autoName =
    kind === 'sessions'
      ? items[0]
        ? `${serviceOf(items[0].serviceId)?.name ?? 'Serviço'} · ${items[0].sessions} sessões`
        : ''
      : items.length
        ? `Combo ${items
            .slice(0, 3)
            .map((item) => serviceOf(item.serviceId)?.name ?? '')
            .join(' + ')}${items.length > 3 ? '…' : ''}`
        : ''
  const finalName = nameTouched ? name : autoName
  const needle = query.trim().toLocaleLowerCase('pt-BR')
  const visible = services.filter(
    (service) =>
      !needle || `${service.name} ${service.category}`.toLocaleLowerCase('pt-BR').includes(needle),
  )

  function toggle(service: Service) {
    setError('')
    if (kind === 'sessions') {
      setItems([{ serviceId: service.id, sessions: Math.max(items[0]?.sessions ?? 5, 2) }])
      return
    }
    setItems((current) =>
      current.some((item) => item.serviceId === service.id)
        ? current.filter((item) => item.serviceId !== service.id)
        : [...current, { serviceId: service.id, sessions: 1 }],
    )
  }
  function applyPercent(text: string) {
    const clean = text.replace(/\D/g, '').slice(0, 2)
    setPercent(clean)
    const value = Number(clean)
    setPriceTouched(true)
    setPrice(moneyInput(Math.round((full * (100 - (Number.isFinite(value) ? value : 0))) / 100)))
  }

  function next() {
    setError('')
    if (step === 'items') {
      if (!items.length)
        return setError(kind === 'combo' ? 'Escolha os serviços do combo.' : 'Escolha o serviço.')
      if (kind === 'combo' && items.length < 2)
        return setError('Um combo junta pelo menos 2 tratamentos.')
      if (kind === 'combo' && !visitMinutes)
        return setError('Escolha quanto tempo leva cada sessão.')
      if (kind === 'sessions' && total < 2) return setError('Pelo menos 2 sessões.')
    }
    if (step === 'price' && (!cents || cents <= 0)) return setError('Confira o preço do pacote.')
    setStep(steps[position + 1])
  }

  async function save() {
    if (!finalName.trim()) return setError('Dê um nome ao pacote.')
    if (!cents || cents <= 0) return setError('Confira o preço do pacote.')
    setSaving(true)
    setError('')
    try {
      await api.put(`catalog/packages/${initial.id}`, {
        name: finalName.trim(),
        kind,
        items: kind === 'combo' ? items.map((item) => ({ ...item, sessions: visits })) : items,
        ...(kind === 'combo' ? { sessions: visits, durationMinutes: visitMinutes } : {}),
        priceCents: cents,
        validityDays: validity,
      })
      onClose(
        isNew ? `${finalName.trim()} criado. Venda na ficha da cliente.` : 'Pacote atualizado.',
      )
    } catch (caught) {
      setError(
        caught instanceof ClinicApiError && caught.status === 403
          ? 'Seu acesso não permite mudar pacotes.'
          : 'Não foi possível salvar o pacote.',
      )
    } finally {
      setSaving(false)
    }
  }

  const summary = [
    kind === 'combo' ? '🎁 Combo' : '🔁 Sessões',
    items.length
      ? kind === 'combo'
        ? `${items.length} ${items.length === 1 ? 'tratamento' : 'tratamentos'} · ${visits} ${visits === 1 ? 'sessão' : 'sessões'}${visitMinutes ? ` · ${minutesLabel(visitMinutes)}` : ''}`
        : `${serviceOf(items[0].serviceId)?.name ?? ''} · ${total} sessões`
      : '',
    position > steps.indexOf('price') && cents ? `💰 ${money(cents)}` : '',
  ].filter(Boolean)

  return (
    <QuickModal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      className="pk-editor"
      title={isNew ? 'Novo pacote' : `Editar ${initial.name}`}
      subtitle={
        <span className="pk-progress" aria-label={`Etapa ${position + 1} de ${steps.length}`}>
          {steps.map((item, index) => (
            <i key={item} data-on={index <= position || undefined} />
          ))}
        </span>
      }
      footer={
        <>
          {error ? (
            <span className="apt-error qm-foot-start" role="alert">
              {error}
            </span>
          ) : null}
          {position > 0 ? (
            <Button variant="ghost" onPress={() => setStep(steps[position - 1])}>
              <ChevronLeft size={16} aria-hidden /> Voltar
            </Button>
          ) : (
            <Button variant="secondary" onPress={() => onClose()}>
              Cancelar
            </Button>
          )}
          {step === 'finish' ? (
            <Button isDisabled={saving} onPress={() => void save()}>
              <Check size={16} aria-hidden />{' '}
              {saving ? 'Salvando…' : isNew ? 'Criar pacote' : 'Salvar'}
            </Button>
          ) : step === 'kind' ? null : (
            <Button onPress={next}>
              Continuar <ChevronRight size={16} aria-hidden />
            </Button>
          )}
        </>
      }
    >
      {step !== 'kind' && summary.length ? (
        <div className="pk-summary">
          {summary.map((text) => (
            <span key={text}>{text}</span>
          ))}
        </div>
      ) : null}

      {step === 'kind' ? (
        <div className="pk-step">
          <h3>Que tipo de pacote?</h3>
          <div className="pk-kinds">
            <button
              type="button"
              aria-pressed={kind === 'combo'}
              onClick={() => {
                setKind('combo')
                setItems([])
                setStep('items')
              }}
            >
              <span className="pk-emoji">🎁</span>
              <strong>Combo</strong>
              <small>
                Tratamentos diferentes feitos juntos em cada sessão. Ex.: 5× limpeza de pele +
                massagem.
              </small>
            </button>
            <button
              type="button"
              aria-pressed={kind === 'sessions'}
              onClick={() => {
                setKind('sessions')
                setItems([])
                setStep('items')
              }}
            >
              <span className="pk-emoji">🔁</span>
              <strong>Sessões de um tratamento</strong>
              <small>O mesmo serviço várias vezes. Ex.: 10 sessões de laser.</small>
            </button>
          </div>
        </div>
      ) : null}

      {step === 'items' ? (
        <div className="pk-step">
          <h3>{kind === 'combo' ? 'O que entra no combo?' : 'Qual tratamento?'}</h3>
          {services.length > 6 ? (
            <SearchInput
              className="biz-search"
              ariaLabel="Buscar serviço"
              placeholder="Buscar serviço"
              value={query}
              onChange={setQuery}
            />
          ) : null}
          <ul className="pk-services">
            {visible.map((service) => {
              const line = items.find((item) => item.serviceId === service.id)
              return (
                <li key={service.id} className={line ? 'is-on' : undefined}>
                  <button
                    type="button"
                    role={kind === 'combo' ? 'checkbox' : 'radio'}
                    aria-checked={Boolean(line)}
                    onClick={() => toggle(service)}
                  >
                    <span className="pk-check" aria-hidden>
                      {line ? <Check size={13} strokeWidth={3} /> : null}
                    </span>
                    <span className="pk-service-name">
                      <strong>{service.name}</strong>
                      <small>
                        {service.category} · {money(service.priceCents)}
                      </small>
                    </span>
                  </button>
                  {line && kind === 'sessions' ? (
                    <Counter
                      value={line.sessions}
                      min={kind === 'sessions' ? 2 : 1}
                      label={service.name}
                      onChange={(sessions) =>
                        setItems((current) =>
                          current.map((item) =>
                            item.serviceId === service.id ? { ...item, sessions } : item,
                          ),
                        )
                      }
                    />
                  ) : null}
                </li>
              )
            })}
          </ul>
          {kind === 'combo' && items.length ? (
            <div className="pk-combo-setup">
              <div className="pk-combo-row">
                <span>
                  <strong>Quantas sessões?</strong>
                  <small>Em cada uma a cliente faz todos os tratamentos marcados.</small>
                </span>
                <Counter value={visits} min={1} label="o combo" onChange={setVisits} />
              </div>
              <div className="pk-combo-row is-column">
                <span>
                  <strong>Quanto tempo leva cada sessão?</strong>
                  <small>
                    É o horário que fica reservado na agenda.
                    {sumMinutes ? ` Somando os tratamentos: ${minutesLabel(sumMinutes)}.` : ''}
                  </small>
                </span>
                <div className="team-choice" role="radiogroup" aria-label="Duração da sessão">
                  {[...new Set([...comboDurations, ...(sumMinutes ? [sumMinutes] : [])])]
                    .filter((minutes) => minutes >= 15 && minutes <= 1440)
                    .sort((a, b) => a - b)
                    .map((minutes) => (
                      <button
                        key={minutes}
                        type="button"
                        role="radio"
                        aria-checked={visitMinutes === minutes}
                        onClick={() => setDuration(minutes)}
                      >
                        {minutesLabel(minutes)}
                      </button>
                    ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 'price' ? (
        <div className="pk-step">
          <h3>Por quanto vai vender?</h3>
          <TextInputField
            className="pk-price"
            label="Preço do pacote"
            inputMode="numeric"
            placeholder={moneyInput(full)}
            prefix={
              <span className="pk-price-prefix">
                {discount ? <s>{money(full)}</s> : null}
                <span>R$</span>
              </span>
            }
            value={priceTouched ? price : moneyInput(full)}
            description={
              discount
                ? `Avulso sairia ${money(full)}. A cliente economiza ${money(full - (cents ?? 0))}.`
                : `Soma dos serviços avulsos: ${money(full)}. Digite o valor do pacote ou aplique um desconto.`
            }
            onChange={(text) => {
              setPriceTouched(true)
              const masked = maskMoney(text)
              setPrice(masked)
              const value = parseMoney(masked)
              setPercent(
                value != null && full > 0 && value < full
                  ? String(Math.round(100 - (value * 100) / full))
                  : '',
              )
            }}
          />
          <div className="pk-discount">
            <TextInputField
              label="Ou aplique um desconto"
              inputMode="numeric"
              placeholder="0"
              suffix="%"
              value={percent}
              onChange={applyPercent}
            />
            <div className="team-choice" role="radiogroup" aria-label="Descontos rápidos">
              {[5, 10, 15, 20].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={discount === value}
                  onClick={() => applyPercent(String(value))}
                >
                  -{value}%
                </button>
              ))}
            </div>
          </div>
          {kind === 'sessions' && cents ? (
            <p className="settings-muted">
              Fica {money(Math.round(cents / Math.max(total, 1)))} por sessão.
            </p>
          ) : null}
        </div>
      ) : null}

      {step === 'finish' ? (
        <div className="pk-step">
          <h3>Validade e nome</h3>
          <span className="pk-label">Depois da compra, vale por</span>
          <div className="pk-validity" role="radiogroup" aria-label="Validade">
            {validityOptions.map((option) => (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={validity === option.id}
                onClick={() => setValidity(option.id)}
              >
                <span>{option.emoji}</span> {option.label}
              </button>
            ))}
          </div>
          <TextInputField
            label="Nome do pacote"
            maxLength={120}
            value={finalName}
            placeholder={autoName}
            description="Aparece na ficha da cliente e no recibo."
            onChange={(text) => {
              setNameTouched(true)
              setName(text)
            }}
          />
          {!isNew ? (
            <p className="settings-muted">
              Mudanças valem para as próximas vendas; quem já comprou mantém o que pagou.
            </p>
          ) : null}
        </div>
      ) : null}
    </QuickModal>
  )
}
