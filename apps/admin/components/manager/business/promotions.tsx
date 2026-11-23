'use client'

import { Button, Spinner } from '@heroui/react'
import {
  BadgePercent,
  CalendarRange,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Megaphone,
  Pause,
  Pencil,
  Play,
  Plus,
  Scissors,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  CheckboxField,
  DateInputField,
  MoneyField,
  SearchInput,
  TextInputField,
} from '@/components/ui/fields'
import { type ClinicApi } from '../settings/clinic-api'
import {
  Empty,
  SaveBar,
  SettingsCard,
  StatusPill,
  TextInput,
  ToggleRow,
  type SaveState,
} from '../settings/settings-kit'
import {
  copyText,
  promotionState,
  promotionText,
  useScrollTop,
  type Catalog,
  type Promotion,
  type Service,
} from './catalog-model'
import { dateBr, money, moneyInput, parseMoney } from './format'
import { ToastNotice } from '@/components/ui/toast-notice'

export function blankPromotion(today: string): Promotion {
  return {
    id: crypto.randomUUID(),
    name: '',
    kind: 'percent',
    percent: 10,
    prices: {},
    startsOn: today,
    endsOn: null,
    status: 'active',
    showOnSite: true,
    serviceIds: [],
  }
}

/** Name suggestion that fits what the space sells most ("Semana de cabelo"). */
export function promotionExample(services: Service[]) {
  const active = services.filter((service) => service.status === 'active')
  const counts = new Map<string, number>()
  for (const service of active)
    counts.set(service.category, (counts.get(service.category) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  return top ? `Semana de ${top.toLocaleLowerCase('pt-BR')}` : 'Semana especial'
}

/**
 * Promoções (Marketing): every promotion with its state, editor, and the WhatsApp list ready to
 * paste. Services shows only a strip that leads here.
 */
export function PromotionsSection({
  api,
  data,
  highlightId,
  onChanged,
}: {
  api: ClinicApi
  data: Catalog
  /** Opened from Serviços → "Ver em Marketing": scrolls to and lights up this promotion. */
  highlightId?: string
  onChanged: () => void
}) {
  const [promo, setPromo] = useState<Promotion | null>(null)
  const [notice, setNotice] = useState('')
  const setPromoFromCard = setPromo
  const example = promotionExample(data.services)
  const live = data.promotions.filter((item) => promotionState(item, data.today).tone !== 'off')
  useEffect(() => {
    if (!highlightId) return
    const frame = requestAnimationFrame(() =>
      document
        .getElementById(`promo-${highlightId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    )
    return () => cancelAnimationFrame(frame)
  }, [highlightId])

  if (promo)
    return (
      <PromotionEditor
        key={promo.id}
        api={api}
        initial={promo}
        isNew={!data.promotions.some((item) => item.id === promo.id)}
        services={data.services.filter((service) => service.status === 'active')}
        today={data.today}
        example={example}
        onClose={(message) => {
          setPromo(null)
          if (message) {
            setNotice(message)
            onChanged()
          }
        }}
      />
    )

  return (
    <>
      <ToastNotice message={notice} onShown={() => setNotice('')} />
      <SettingsCard
        icon={<BadgePercent size={20} />}
        title="Promoções"
        description="Desconto em porcentagem ou um valor escolhido para cada serviço, por um período. O site mostra o preço riscado e o novo valor."
        help={{
          title: 'Como a promoção funciona?',
          text: 'Escolha os serviços, o desconto (uma porcentagem para todos ou um valor para cada um) e as datas. Enquanto estiver ativa, o site mostra “De R$ 100 por R$ 80” e os novos agendamentos já guardam o preço com desconto. Serviços “sob consulta” não entram em promoção.',
        }}
        badge={
          data.canManage ? (
            <Button size="sm" onPress={() => setPromoFromCard(blankPromotion(data.today))}>
              <Plus size={15} aria-hidden /> Nova promoção
            </Button>
          ) : null
        }
      >
        {data.promotions.length ? (
          <ul className="biz-grid">
            {data.promotions.map((item) => {
              const state = promotionState(item, data.today)
              return (
                <li
                  key={item.id}
                  id={`promo-${item.id}`}
                  className={`biz-tile biz-promo-card${item.id === highlightId ? ' is-focused' : ''}`}
                >
                  <div className="biz-tile-head">
                    <span className="biz-tile-icon" aria-hidden>
                      <BadgePercent size={20} />
                    </span>
                    <div className="biz-tile-title">
                      <strong title={item.name}>{item.name}</strong>
                      <span className="biz-row-meta">
                        {item.serviceIds.length}{' '}
                        {item.serviceIds.length === 1 ? 'serviço' : 'serviços'}
                      </span>
                    </div>
                    <div className="biz-price">
                      <strong>
                        {item.kind === 'custom' ? `até -${item.percent}%` : `-${item.percent}%`}
                      </strong>
                    </div>
                  </div>
                  <div className="biz-row-main">
                    <span className="biz-row-meta">
                      <CalendarRange size={13} aria-hidden /> {dateBr(item.startsOn)}
                      {item.endsOn ? ` até ${dateBr(item.endsOn)}` : ' · sem data para acabar'}
                    </span>
                    <div className="biz-tags">
                      <StatusPill tone={state.tone}>{state.label}</StatusPill>
                      <StatusPill tone="info">
                        {item.showOnSite ? (
                          <>
                            <Eye size={12} aria-hidden /> No site
                          </>
                        ) : (
                          <>
                            <EyeOff size={12} aria-hidden /> Só na agenda
                          </>
                        )}
                      </StatusPill>
                    </div>
                  </div>
                  {data.canManage ? (
                    <div className="biz-tile-actions">
                      <Button
                        size="sm"
                        className="svc-edit"
                        variant="secondary"
                        onPress={() => setPromoFromCard(item)}
                      >
                        <Pencil size={14} aria-hidden /> Editar
                      </Button>
                      <Button
                        size="sm"
                        className="promo-copy"
                        variant="secondary"
                        onPress={() =>
                          void copyText(promotionText(item, data.services)).then((ok) =>
                            setNotice(
                              ok
                                ? `Lista de “${item.name}” copiada. É só colar no WhatsApp.`
                                : 'Não foi possível copiar. Tente de novo.',
                            ),
                          )
                        }
                      >
                        <Copy size={14} aria-hidden /> Copiar para WhatsApp
                      </Button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="biz-empty">
            <BadgePercent size={24} aria-hidden />
            <p>Nenhuma promoção ainda. Que tal uma “{example}” com 15% de desconto?</p>
          </div>
        )}
      </SettingsCard>

      {live.length > 1 ? (
        <div className="biz-actions">
          <Button
            variant="secondary"
            onPress={() =>
              void copyText(
                live.map((item) => promotionText(item, data.services)).join('\n\n━━━━━━━━━━\n\n'),
              ).then((ok) =>
                setNotice(
                  ok
                    ? `${live.length} promoções copiadas. É só colar no WhatsApp.`
                    : 'Não foi possível copiar.',
                ),
              )
            }
          >
            <Megaphone size={15} aria-hidden /> Copiar todas as promoções ativas
          </Button>
        </div>
      ) : null}
    </>
  )
}

/** Promotions as a strip inside Serviços: what is running, a shortcut to create and to see all. */
export function PromotionsStrip({
  data,
  onCreate,
  onOpenAll,
}: {
  data: Catalog
  onCreate: () => void
  onOpenAll?: (promotionId?: string) => void
}) {
  const live = data.promotions.filter((item) => promotionState(item, data.today).tone !== 'off')
  return (
    <div className="biz-promo-strip">
      <span className="biz-promo-strip-icon" aria-hidden>
        <BadgePercent size={20} />
      </span>
      <div className="biz-promo-strip-copy">
        <strong>
          {live.length
            ? `${live.length} ${live.length === 1 ? 'promoção rodando' : 'promoções rodando'}`
            : 'Nenhuma promoção rodando'}
        </strong>
        <span>
          {live.length
            ? live
                .slice(0, 3)
                .map((item) => item.name)
                .join(' · ')
            : 'Crie uma e o site mostra o preço riscado.'}
        </span>
      </div>
      <div className="biz-promo-strip-actions">
        {data.canManage ? (
          <Button size="sm" className="promo-create" onPress={onCreate}>
            <Plus size={15} aria-hidden /> Nova promoção
          </Button>
        ) : null}
        {onOpenAll ? (
          <Button
            size="sm"
            className="promo-more"
            variant="secondary"
            onPress={() => onOpenAll(live[0]?.id)}
          >
            Ver em Marketing <ChevronRight size={15} aria-hidden />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function PromotionEditor({
  api,
  initial,
  isNew,
  services,
  today,
  example,
  backLabel = 'Voltar para as promoções',
  onClose,
}: {
  api: ClinicApi
  initial: Promotion
  isNew: boolean
  services: Service[]
  today: string
  /** Name suggestion that fits what this space sells. */
  example: string
  backLabel?: string
  onClose: (message?: string) => void
}) {
  useScrollTop()
  const [promotion, setPromotion] = useState(initial)
  const [search, setSearch] = useState('')
  const [onlyChosen, setOnlyChosen] = useState(false)
  const [copied, setCopied] = useState('')
  // Typed prices of the "valor por serviço" kind, as text, keyed by service id.
  const [priceText, setPriceText] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(initial.prices).map(([id, cents]) => [id, moneyInput(cents)]),
    ),
  )
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const [showErrors, setShowErrors] = useState(false)
  const set = (patch: Partial<Promotion>) => {
    setPromotion((current) => ({ ...current, ...patch }))
    if (state.status !== 'saving') setState({ status: 'idle' })
  }
  const eligible = services.filter((service) => service.priceType !== 'quote')
  const custom = promotion.kind === 'custom'
  const chosen = eligible.filter((service) => promotion.serviceIds.includes(service.id))
  const typed = (service: Service) => parseMoney(priceText[service.id] ?? '')
  const validPrice = (service: Service) => {
    const cents = typed(service)
    return cents != null && cents > 0 && cents < service.priceCents
  }
  const prices = Object.fromEntries(
    chosen.filter(validPrice).map((service) => [service.id, typed(service)!]),
  )
  // The largest discount summarizes a "valor por serviço" promotion in lists.
  const customPercent = Math.min(
    90,
    Math.max(
      1,
      ...chosen
        .filter(validPrice)
        .map((service) => Math.round(100 - (typed(service)! * 100) / service.priceCents)),
    ),
  )
  const preview: Promotion = custom ? { ...promotion, prices, percent: customPercent } : promotion
  const needle = search.trim().toLocaleLowerCase('pt-BR')
  const listed = eligible.filter(
    (service) =>
      (!onlyChosen || promotion.serviceIds.includes(service.id)) &&
      (!needle ||
        `${service.name} ${service.category}`.toLocaleLowerCase('pt-BR').includes(needle)),
  )
  const toggle = (service: Service) =>
    set({
      serviceIds: promotion.serviceIds.includes(service.id)
        ? promotion.serviceIds.filter((id) => id !== service.id)
        : [...promotion.serviceIds, service.id],
    })
  const errors = {
    name: !promotion.name.trim() ? 'Dê um nome para a promoção.' : '',
    services: !promotion.serviceIds.length
      ? 'Escolha pelo menos um serviço.'
      : custom && !chosen.every(validPrice)
        ? 'Digite o valor promocional de cada serviço escolhido, menor que o preço normal.'
        : '',
    dates:
      promotion.endsOn && promotion.endsOn < promotion.startsOn
        ? 'O fim precisa ser depois do início.'
        : '',
  }

  async function save(status = promotion.status) {
    if (Object.values(errors).some(Boolean)) {
      setShowErrors(true)
      setState({ status: 'error', message: 'Confira os campos marcados.' })
      return
    }
    setState({ status: 'saving' })
    try {
      await api.put(`catalog/promotions/${promotion.id}`, {
        name: promotion.name.trim(),
        kind: promotion.kind,
        percent: custom ? customPercent : promotion.percent,
        ...(custom ? { prices } : {}),
        startsOn: promotion.startsOn,
        endsOn: promotion.endsOn,
        status,
        showOnSite: promotion.showOnSite,
        serviceIds: custom ? chosen.map((service) => service.id) : promotion.serviceIds,
      })
      onClose(
        status === 'archived'
          ? 'Promoção encerrada. Os preços voltaram ao normal.'
          : status === 'paused'
            ? 'Promoção pausada.'
            : isNew
              ? 'Promoção criada! O site já mostra os novos preços no período.'
              : 'Promoção atualizada.',
      )
    } catch {
      setState({ status: 'error', message: 'Não foi possível salvar. Tente de novo.' })
    }
  }

  return (
    <div className="biz-stack">
      <div className="team-editor-head">
        <Button variant="secondary" onPress={() => onClose()}>
          ← {backLabel}
        </Button>
        <h3>{isNew ? 'Nova promoção' : `Editar ${initial.name}`}</h3>
        {!isNew ? (
          <StatusPill tone={promotionState(initial, today).tone}>
            {promotionState(initial, today).label}
          </StatusPill>
        ) : null}
      </div>
      <SettingsCard icon={<BadgePercent size={20} />} title="Desconto">
        <div className="settings-grid">
          <TextInput
            label="Nome da promoção"
            value={promotion.name}
            maxLength={80}
            placeholder={`Ex.: ${example}`}
            error={showErrors ? errors.name : undefined}
            onChange={(name) => set({ name })}
          />
          <div className="settings-field">
            <span className="settings-field-label">
              <label>Tipo de desconto</label>
            </span>
            <div className="team-choice" role="radiogroup" aria-label="Tipo de desconto">
              {(
                [
                  ['percent', 'Mesma porcentagem'],
                  ['custom', 'Valor por serviço'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={promotion.kind === id}
                  onClick={() => set({ kind: id })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {custom ? (
            <p className="settings-muted is-wide">
              Você digita o valor promocional de cada serviço na lista abaixo. Bom para “flash day”,
              combos e tabelas com preços redondos.
            </p>
          ) : (
            <div className="settings-field is-wide">
              <span className="settings-field-label">
                <label>Desconto</label>
              </span>
              <div className="team-choice" role="radiogroup" aria-label="Porcentagem">
                {[10, 15, 20, 25, 30, 50].map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={promotion.percent === value}
                    onClick={() => set({ percent: value })}
                  >
                    {value}%
                  </button>
                ))}
                <TextInputField
                  className="biz-percent"
                  ariaLabel="Outra porcentagem"
                  inputMode="numeric"
                  value={String(promotion.percent)}
                  suffix="%"
                  onChange={(text) => {
                    const value = Number(text.replace(/\D/g, ''))
                    set({ percent: Math.min(90, Math.max(1, value || 1)) })
                  }}
                />
              </div>
            </div>
          )}
          <DateInputField
            label="Começa em"
            min={today}
            value={promotion.startsOn}
            onChange={(startsOn) => set({ startsOn: startsOn || today })}
          />
          <DateInputField
            label="Termina em (opcional)"
            value={promotion.endsOn ?? ''}
            min={promotion.startsOn > today ? promotion.startsOn : today}
            error={showErrors ? errors.dates || undefined : undefined}
            description="Deixe vazio para não ter data de fim."
            onChange={(endsOn) => set({ endsOn: endsOn || null })}
          />
        </div>
        <ToggleRow
          icon={<Eye size={17} />}
          title="Mostrar no site"
          description="Desligado, o desconto vale só para agendamentos feitos pela equipe."
          isSelected={promotion.showOnSite}
          onChange={(showOnSite) => set({ showOnSite })}
        />
      </SettingsCard>
      <SettingsCard
        icon={<Scissors size={20} />}
        title="Serviços na promoção"
        description={
          custom
            ? 'Marque os serviços e digite quanto cada um custa na promoção.'
            : 'Veja como fica o preço de cada um.'
        }
        badge={<StatusPill tone="info">{promotion.serviceIds.length} escolhidos</StatusPill>}
      >
        {showErrors && errors.services ? (
          <p className="settings-field-error">{errors.services}</p>
        ) : null}
        <div className="data-toolbar">
          <SearchInput
            className="data-search"
            ariaLabel="Buscar serviço para a promoção"
            placeholder="Buscar serviço ou categoria"
            value={search}
            onChange={setSearch}
          />
          <div className="biz-chips" role="group" aria-label="Mostrar">
            <button type="button" aria-pressed={!onlyChosen} onClick={() => setOnlyChosen(false)}>
              Todos
            </button>
            <button type="button" aria-pressed={onlyChosen} onClick={() => setOnlyChosen(true)}>
              Escolhidos ({promotion.serviceIds.length})
            </button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={!listed.length}
            onPress={() => {
              const ids = listed.map((service) => service.id)
              const all = ids.every((id) => promotion.serviceIds.includes(id))
              set({
                serviceIds: all
                  ? promotion.serviceIds.filter((id) => !ids.includes(id))
                  : [...new Set([...promotion.serviceIds, ...ids])],
              })
            }}
          >
            {listed.length && listed.every((service) => promotion.serviceIds.includes(service.id))
              ? 'Desmarcar os da lista'
              : 'Marcar os da lista'}
          </Button>
        </div>
        {listed.length ? (
          <ul className="biz-promo-services">
            {listed.map((service) => {
              const checked = promotion.serviceIds.includes(service.id)
              const invalid = custom && checked && showErrors && !validPrice(service)
              return (
                <li key={service.id}>
                  <CheckboxField
                    label={service.name}
                    description={service.category}
                    isSelected={checked}
                    onChange={() => toggle(service)}
                  />
                  {custom ? (
                    <span className="biz-price biz-promo-custom">
                      <s>{money(service.priceCents)}</s>
                      <MoneyField
                        className="biz-promo-input"
                        ariaLabel={`Valor promocional de ${service.name}`}
                        value={priceText[service.id] ?? ''}
                        error={invalid ? 'Menor que o normal' : undefined}
                        onChange={(text) => {
                          setPriceText((current) => ({ ...current, [service.id]: text }))
                          if (text && !checked) toggle(service)
                          else if (state.status !== 'saving') setState({ status: 'idle' })
                        }}
                      />
                    </span>
                  ) : (
                    <span className="biz-price">
                      <s>{money(service.priceCents)}</s>
                      <strong>
                        {money(Math.round((service.priceCents * (100 - promotion.percent)) / 100))}
                      </strong>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <Empty>Nenhum serviço com esse nome.</Empty>
        )}
        {services.length > eligible.length ? (
          <p className="settings-footnote">Serviços “sob consulta” não entram em promoção.</p>
        ) : null}
      </SettingsCard>
      <SettingsCard
        icon={<Copy size={20} />}
        title="Divulgar no WhatsApp"
        description="Lista pronta com o nome da promoção, as categorias e os preços. Copie e cole na conversa, no status ou no grupo."
        badge={
          <Button
            size="sm"
            isDisabled={!chosen.length}
            onPress={() =>
              void copyText(promotionText(preview, services)).then((ok) =>
                setCopied(ok ? 'Copiado! É só colar no WhatsApp.' : 'Não foi possível copiar.'),
              )
            }
          >
            <Copy size={15} aria-hidden /> Copiar lista
          </Button>
        }
      >
        {chosen.length ? (
          <pre className="biz-promo-text">{promotionText(preview, services)}</pre>
        ) : (
          <Empty>Escolha os serviços para ver a lista.</Empty>
        )}
        <ToastNotice message={copied} onShown={() => setCopied('')} />
      </SettingsCard>
      <div className="team-danger">
        {!isNew && initial.status === 'active' ? (
          <Button variant="ghost" onPress={() => void save('paused')}>
            <Pause size={15} aria-hidden /> Pausar
          </Button>
        ) : null}
        {!isNew && initial.status === 'paused' ? (
          <Button variant="ghost" onPress={() => void save('active')}>
            <Play size={15} aria-hidden /> Reativar
          </Button>
        ) : null}
        {!isNew ? (
          <Button variant="ghost" onPress={() => void save('archived')}>
            Encerrar promoção
          </Button>
        ) : null}
        {state.status === 'saving' ? <Spinner size="sm" aria-label="Salvando" /> : null}
      </div>
      <SaveBar
        dirty
        state={state}
        onSave={() => void save()}
        onDiscard={() => onClose()}
        label={isNew ? 'Criar promoção' : 'Salvar promoção'}
      />
    </div>
  )
}
