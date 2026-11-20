'use client'

import { Button } from '@heroui/react'
import {
  CalendarCheck,
  CalendarPlus,
  Check,
  Cpu,
  Pencil,
  Plus,
  Receipt,
  Store,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'
import {
  equipmentCatalog,
  equipmentKey,
  equipmentPresentation,
  suggestedEquipment,
} from '@/components/onboarding/special-equipment'
import {
  CheckboxField,
  DateInputField,
  MoneyField,
  SearchInput,
  SelectField,
  TextInputField,
} from '@/components/ui/fields'
import { QuickModal } from '../quick-modal'
import { type ClinicApi } from '../settings/clinic-api'
import type { Service } from './catalog-model'
import { dateBr, money, moneyInput, parseMoney } from './format'

export type Rental = {
  id: string
  startsOn: string
  endsOn: string
  costCents: number | null
  note: string
  inFinance: boolean
}
export type Equipment = {
  id: string
  name: string
  supplier: string
  defaultCostCents: number | null
  status: 'active' | 'archived'
  serviceIds: string[]
  rentals: Rental[]
}

const methods = [
  { id: 'pix', label: 'Pix' },
  { id: 'transfer', label: 'Transferência' },
  { id: 'cash', label: 'Dinheiro' },
  { id: 'credit', label: 'Crédito' },
  { id: 'debit', label: 'Débito' },
  { id: 'other', label: 'Outro' },
]

function shortDay(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
    .format(new Date(`${iso}T12:00:00`))
    .replace('.', '')
}

/**
 * Aparelhos alugados: cada aparelho, os serviços que dependem dele e os dias de aluguel. Nesses
 * dias os serviços ligados aparecem para as clientes agendarem; fora deles, só a equipe agenda
 * (com aviso). O custo do aluguel pode ir direto para o Financeiro.
 */
export function EquipmentTab({
  api,
  services,
  equipment,
  today,
  canManage,
  canFinance,
  onChanged,
}: {
  api: ClinicApi
  services: Service[]
  equipment: Equipment[]
  today: string
  canManage: boolean
  canFinance: boolean
  onChanged: (message: string) => void
}) {
  const [editing, setEditing] = useState<Equipment | null>(null)
  const [renting, setRenting] = useState<Equipment | null>(null)
  const [busy, setBusy] = useState('')
  const name = (id: string) => services.find((service) => service.id === id)?.name ?? 'Serviço'
  const shown = equipment.filter((item) => item.status === 'active')
  const archived = equipment.filter((item) => item.status === 'archived')

  async function removeRental(rental: Rental) {
    setBusy(rental.id)
    try {
      const result = await api.post<{ financeEntryVoided: boolean }>(
        `catalog/rentals/${rental.id}/remove`,
        {},
      )
      onChanged(
        `Aluguel de ${shortDay(rental.startsOn)} removido${result.financeEntryVoided ? ' e a despesa anulada no Financeiro' : ''}.`,
      )
    } catch {
      onChanged('Não foi possível remover o aluguel.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="biz-tab-body">
      <div className="biz-tab-intro">
        <span className="biz-tab-intro-icon" aria-hidden>
          <Cpu size={22} />
        </span>
        <div>
          <strong>Aparelhos alugados</strong>
          <p>
            Laser, ultrassom microfocado, criolipólise… Marque os dias em que o aparelho estará no
            espaço: só nesses dias as clientes conseguem agendar os serviços dele.
          </p>
        </div>
        {canManage ? (
          <Button
            onPress={() =>
              setEditing({
                id: '',
                name: '',
                supplier: '',
                defaultCostCents: null,
                status: 'active',
                serviceIds: [],
                rentals: [],
              })
            }
          >
            <Plus size={16} aria-hidden /> Novo aparelho
          </Button>
        ) : null}
      </div>

      {shown.length ? (
        <ul className="eq-grid">
          {shown.map((item) => {
            const upcoming = item.rentals.filter((rental) => rental.endsOn >= today)
            const now = upcoming.find((rental) => rental.startsOn <= today)
            const past = item.rentals.filter((rental) => rental.endsOn < today).slice(-2)
            const art = equipmentPresentation(item.name)
            return (
              <li key={item.id} className={`eq-card${now ? ' is-here' : ''}`}>
                <div className="eq-card-art">
                  <Image src={art.image} alt="" width={150} height={150} sizes="150px" />
                  <span
                    className={`eq-badge${now ? ' is-here' : upcoming.length ? ' is-soon' : ''}`}
                  >
                    {now
                      ? '🟢 No espaço agora'
                      : upcoming.length
                        ? `📅 Chega ${shortDay(upcoming[0].startsOn)}`
                        : '⚪ Sem aluguel marcado'}
                  </span>
                  {canManage ? (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      className="eq-card-edit"
                      aria-label={`Editar ${item.name}`}
                      onPress={() => setEditing(item)}
                    >
                      <Pencil size={15} />
                    </Button>
                  ) : null}
                </div>
                <div className="eq-card-body">
                  <div className="eq-card-title">
                    <strong title={item.name}>{item.name}</strong>
                    <small>
                      <Store size={12} aria-hidden /> {item.supplier || 'Fornecedor não informado'}
                      {item.defaultCostCents != null
                        ? ` · ${money(item.defaultCostCents)} por aluguel`
                        : ''}
                    </small>
                  </div>
                  <div className="biz-device-services">
                    {item.serviceIds.length ? (
                      item.serviceIds.map((id) => <span key={id}>{name(id)}</span>)
                    ) : (
                      <span className="is-warn">
                        <TriangleAlert size={13} aria-hidden /> Nenhum serviço ligado
                      </span>
                    )}
                  </div>
                  <div className="eq-days">
                    {upcoming.length ? (
                      <ul>
                        {upcoming.map((rental) => (
                          <li key={rental.id}>
                            <span className="biz-day-chip">
                              {rental.startsOn === rental.endsOn
                                ? shortDay(rental.startsOn)
                                : `${shortDay(rental.startsOn)} – ${shortDay(rental.endsOn)}`}
                            </span>
                            <span className="biz-row-meta">
                              {rental.costCents != null ? money(rental.costCents) : ''}
                              {rental.inFinance ? (
                                <>
                                  {' '}
                                  <Receipt size={12} aria-label="No Financeiro" />
                                </>
                              ) : null}
                              {rental.note ? ` · ${rental.note}` : ''}
                            </span>
                            {canManage ? (
                              <Button
                                isIconOnly
                                size="sm"
                                variant="ghost"
                                aria-label={`Remover aluguel de ${dateBr(rental.startsOn)}`}
                                isDisabled={busy === rental.id}
                                onPress={() => void removeRental(rental)}
                              >
                                <Trash2 size={14} />
                              </Button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="biz-row-meta">
                        Sem dia marcado: as clientes não conseguem agendar esses serviços.
                      </p>
                    )}
                    {past.length ? (
                      <p className="biz-row-meta">
                        Últimos: {past.map((rental) => shortDay(rental.startsOn)).join(', ')}
                      </p>
                    ) : null}
                  </div>
                  {canManage ? (
                    <div className="eq-card-actions">
                      <Button size="sm" onPress={() => setRenting(item)}>
                        <CalendarPlus size={14} aria-hidden /> Marcar aluguel
                      </Button>
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="biz-empty-hero">
          <Cpu size={30} aria-hidden />
          <strong>Nenhum aparelho alugado</strong>
          <p>
            Cadastre o aparelho, ligue aos serviços (ex.: Laser → Depilação a laser) e marque os
            dias do aluguel. O custo pode entrar no Financeiro automaticamente.
          </p>
        </div>
      )}

      {archived.length ? (
        <p className="biz-row-meta">
          Arquivados: {archived.map((item) => item.name).join(', ')}.{' '}
          {canManage ? 'Edite um deles para trazer de volta.' : ''}
          {canManage
            ? archived.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="team-link"
                  onClick={() => setEditing(item)}
                >
                  {item.name}
                </button>
              ))
            : null}
        </p>
      ) : null}

      {editing ? (
        <EquipmentEditor
          key={editing.id || 'new'}
          api={api}
          initial={editing}
          services={services.filter((service) => service.status === 'active')}
          equipment={equipment}
          onClose={(message) => {
            setEditing(null)
            if (message) onChanged(message)
          }}
        />
      ) : null}
      {renting ? (
        <RentalEditor
          api={api}
          equipment={renting}
          serviceNames={renting.serviceIds.map(name)}
          today={today}
          canFinance={canFinance}
          onClose={(message) => {
            setRenting(null)
            if (message) onChanged(message)
          }}
        />
      ) : null}
    </div>
  )
}

type Pick = { name: string; serviceIds: string[]; catalog: boolean }

/**
 * Novo aparelho, como no cadastro inicial: os aparelhos do catálogo com foto (os que combinam
 * com os seus serviços especiais primeiro), ou "Outro aparelho". Depois o nome, fornecedor,
 * valor e os serviços que ele executa, já marcados pela sugestão.
 */
function EquipmentEditor({
  api,
  initial,
  services,
  equipment,
  onClose,
}: {
  api: ClinicApi
  initial: Equipment
  services: Service[]
  equipment: Equipment[]
  onClose: (message?: string) => void
}) {
  const isNew = !initial.id
  const [step, setStep] = useState<'pick' | 'details'>(isNew ? 'pick' : 'details')
  const [item, setItem] = useState(initial)
  const [cost, setCost] = useState(
    initial.defaultCostCents != null ? moneyInput(initial.defaultCostCents) : '',
  )
  const [query, setQuery] = useState('')
  const [serviceQuery, setServiceQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const taken = new Set(
    equipment.filter((entry) => entry.id !== initial.id).map((entry) => equipmentKey(entry.name)),
  )
  const linkedElsewhere = new Map(
    equipment
      .filter((entry) => entry.id !== initial.id && entry.status === 'active')
      .flatMap((entry) => entry.serviceIds.map((id) => [id, entry.name] as const)),
  )
  // Special treatments (services that depend on a device) recommend their machine first.
  const special = new Set(
    services
      .filter((service) => service.bookingMode === 'manual_release')
      .map((service) => service.id),
  )
  const matches = new Map(
    suggestedEquipment(services).map((choice) => [equipmentKey(choice.name), choice.serviceIds]),
  )
  const needle = equipmentKey(query)
  const picks: (Pick & { score: number })[] = equipmentCatalog
    .map((entry) => {
      const ids = matches.get(equipmentKey(entry.name)) ?? []
      return {
        name: entry.name,
        serviceIds: ids,
        catalog: true,
        score: ids.some((id) => special.has(id)) ? 2 : ids.length ? 1 : 0,
      }
    })
    .filter((entry) => !needle || equipmentKey(entry.name).includes(needle))
    .sort((a, b) => b.score - a.score)
  const recommended = picks.filter((entry) => entry.score > 0)
  const others = picks.filter((entry) => entry.score === 0)
  const presentation = equipmentPresentation(item.name)
  const serviceNeedle = equipmentKey(serviceQuery)
  const visibleServices = services
    .filter((service) => !serviceNeedle || equipmentKey(service.name).includes(serviceNeedle))
    .sort(
      (a, b) =>
        Number(item.serviceIds.includes(b.id)) - Number(item.serviceIds.includes(a.id)) ||
        a.name.localeCompare(b.name, 'pt-BR'),
    )

  function choose(pick: Pick) {
    setItem({ ...item, name: pick.name, serviceIds: pick.serviceIds })
    setError('')
    setStep('details')
  }

  async function save() {
    if (!item.name.trim()) return setError('Escreva o nome do aparelho.')
    if (taken.has(equipmentKey(item.name))) return setError('Já existe um aparelho com esse nome.')
    const cents = cost ? parseMoney(cost) : null
    if (cost && !cents) return setError('Confira o valor do aluguel.')
    setSaving(true)
    setError('')
    const body = {
      name: item.name.trim(),
      supplier: item.supplier.trim(),
      defaultCostCents: cents,
      serviceIds: item.serviceIds,
    }
    try {
      if (isNew) await api.post('catalog/equipment', body)
      else await api.put(`catalog/equipment/${item.id}`, body)
      onClose(
        isNew ? `${body.name} cadastrado. Marque os dias do aluguel.` : 'Aparelho atualizado.',
      )
    } catch {
      setError('Não foi possível salvar. Confira se já existe um aparelho com esse nome.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    setSaving(true)
    setError('')
    try {
      const result = await api.post<{ financeEntriesVoided: number }>(
        `catalog/equipment/${initial.id}/remove`,
        {},
      )
      onClose(
        `${initial.name} excluído${result.financeEntriesVoided ? '. As despesas dos aluguéis que ainda não aconteceram foram anuladas no Financeiro' : ''}.`,
      )
    } catch {
      setError('Não foi possível excluir o aparelho.')
      setConfirmDelete(false)
    } finally {
      setSaving(false)
    }
  }

  const card = (pick: Pick & { score: number }) => {
    const art = equipmentPresentation(pick.name)
    const already = taken.has(equipmentKey(pick.name))
    return (
      <li key={pick.name}>
        <button
          type="button"
          className={`eq-pick${pick.score === 2 ? ' is-special' : ''}`}
          disabled={already}
          onClick={() => choose(pick)}
        >
          <span className="eq-art">
            <Image src={art.image} alt="" width={140} height={140} sizes="140px" />
          </span>
          <span className="eq-pick-copy">
            <strong>{pick.name}</strong>
            <small>{art.description}</small>
            <em>
              {already
                ? 'Já cadastrado'
                : pick.score === 2
                  ? `⭐ Para os seus tratamentos especiais`
                  : pick.serviceIds.length
                    ? `${pick.serviceIds.length} ${pick.serviceIds.length === 1 ? 'serviço compatível' : 'serviços compatíveis'}`
                    : 'Escolha os serviços depois'}
            </em>
          </span>
        </button>
      </li>
    )
  }

  return (
    <QuickModal
      isOpen
      tone="glow"
      badge={isNew ? 'Novo aparelho' : 'Aparelho'}
      onOpenChange={(open) => !open && onClose()}
      size="xl"
      className="eq-modal"
      title={
        step === 'pick'
          ? 'Qual aparelho você aluga?'
          : isNew
            ? 'Detalhes do aparelho'
            : `Editar ${initial.name}`
      }
      subtitle={
        step === 'pick'
          ? 'Os que combinam com os seus serviços aparecem primeiro. Escolha um ou cadastre outro.'
          : 'Os serviços marcados só ficam disponíveis para as clientes nos dias de aluguel.'
      }
      footer={
        confirmDelete ? (
          <>
            <span className="eq-delete-ask qm-foot-start" role="alert">
              Excluir {initial.name}? Os dias de aluguel saem junto e os serviços deixam de depender
              dele.
            </span>
            <Button variant="secondary" isDisabled={saving} onPress={() => setConfirmDelete(false)}>
              Não
            </Button>
            <Button variant="danger" isDisabled={saving} onPress={() => void remove()}>
              <Trash2 size={16} aria-hidden /> {saving ? 'Excluindo…' : 'Excluir de vez'}
            </Button>
          </>
        ) : (
          <>
            {!isNew ? (
              <Button
                variant="ghost"
                className="eq-delete qm-foot-start"
                aria-label="Excluir aparelho"
                isDisabled={saving}
                onPress={() => setConfirmDelete(true)}
              >
                <Trash2 size={17} aria-hidden />
                <span>Excluir aparelho</span>
              </Button>
            ) : null}
            {error ? (
              <span className="apt-error qm-foot-start" role="alert">
                {error}
              </span>
            ) : null}
            {step === 'details' && isNew ? (
              <Button variant="ghost" onPress={() => setStep('pick')}>
                Escolher outro
              </Button>
            ) : (
              <Button variant="secondary" onPress={() => onClose()}>
                Cancelar
              </Button>
            )}
            {step === 'details' ? (
              <Button isDisabled={saving} onPress={() => void save()}>
                {saving ? 'Salvando…' : isNew ? 'Cadastrar aparelho' : 'Salvar'}
              </Button>
            ) : null}
          </>
        )
      }
    >
      {step === 'pick' ? (
        <div className="eq-picker">
          <SearchInput
            ariaLabel="Buscar aparelho"
            placeholder="Buscar aparelho"
            value={query}
            onChange={setQuery}
          />
          {recommended.length ? (
            <>
              <h4 className="eq-group">Recomendados para o seu espaço</h4>
              <ul className="eq-picks">{recommended.map(card)}</ul>
            </>
          ) : null}
          <h4 className="eq-group">{recommended.length ? 'Outros aparelhos' : 'Aparelhos'}</h4>
          <ul className="eq-picks">
            {others.map(card)}
            <li>
              <button
                type="button"
                className="eq-pick is-custom"
                onClick={() => choose({ name: '', serviceIds: [], catalog: false })}
              >
                <span className="eq-art">
                  <Image src="/brand/machines/22.webp" alt="" width={140} height={140} />
                </span>
                <span className="eq-pick-copy">
                  <strong>Outro aparelho</strong>
                  <small>Um kit portátil, uma estação multifuncional ou o seu modelo.</small>
                  <em>
                    <Plus size={12} aria-hidden /> Cadastrar
                  </em>
                </span>
              </button>
            </li>
          </ul>
        </div>
      ) : (
        <div className="eq-details">
          <div className="eq-details-head">
            <span className="eq-art is-small">
              <Image src={presentation.image} alt="" width={96} height={96} />
            </span>
            <div className="eq-details-fields">
              <TextInputField
                label="Nome do aparelho"
                maxLength={160}
                placeholder="Ex.: Laser Soprano Ice"
                value={item.name}
                onChange={(name) => setItem({ ...item, name })}
              />
              <div className="settings-grid">
                <TextInputField
                  label="Fornecedor (opcional)"
                  maxLength={120}
                  value={item.supplier}
                  onChange={(supplier) => setItem({ ...item, supplier })}
                />
                <MoneyField
                  className="qm-money"
                  label="Valor de costume por aluguel"
                  value={cost}
                  onChange={setCost}
                />
              </div>
            </div>
          </div>
          <div className="eq-services">
            <div className="eq-services-head">
              <strong>Que serviços ele executa?</strong>
              <small>
                {item.serviceIds.length
                  ? `${item.serviceIds.length} ${item.serviceIds.length === 1 ? 'marcado' : 'marcados'}`
                  : 'Nenhum marcado'}
              </small>
            </div>
            {services.length > 8 ? (
              <SearchInput
                ariaLabel="Buscar serviço"
                placeholder="Buscar serviço"
                value={serviceQuery}
                onChange={setServiceQuery}
              />
            ) : null}
            <ul>
              {visibleServices.map((service) => {
                const on = item.serviceIds.includes(service.id)
                const other = linkedElsewhere.get(service.id)
                return (
                  <li key={service.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() =>
                        setItem({
                          ...item,
                          serviceIds: on
                            ? item.serviceIds.filter((id) => id !== service.id)
                            : [...item.serviceIds, service.id],
                        })
                      }
                    >
                      <span className="eq-check" aria-hidden>
                        {on ? <Check size={13} strokeWidth={3} /> : null}
                      </span>
                      <span>
                        <strong>
                          {special.has(service.id) ? '⭐ ' : ''}
                          {service.name}
                        </strong>
                        <small>
                          {service.category}
                          {other ? ` · também usa ${other}` : ''}
                        </small>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </QuickModal>
  )
}

function RentalEditor({
  api,
  equipment,
  serviceNames,
  today,
  canFinance,
  onClose,
}: {
  api: ClinicApi
  equipment: Equipment
  serviceNames: string[]
  today: string
  canFinance: boolean
  onClose: (message?: string) => void
}) {
  const [form, setForm] = useState({
    startsOn: today,
    endsOn: today,
    cost: equipment.defaultCostCents != null ? moneyInput(equipment.defaultCostCents) : '',
    note: '',
    registerExpense: canFinance && equipment.defaultCostCents != null,
    method: 'pix',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!form.startsOn || !form.endsOn || form.endsOn < form.startsOn)
      return setError('Confira as datas.')
    const cents = form.cost ? parseMoney(form.cost) : null
    if (form.cost && !cents) return setError('Confira o valor.')
    if (form.registerExpense && !cents) return setError('Informe o valor para lançar a despesa.')
    setSaving(true)
    setError('')
    try {
      await api.post(`catalog/equipment/${equipment.id}/rentals`, {
        startsOn: form.startsOn,
        endsOn: form.endsOn,
        costCents: cents,
        note: form.note.trim() || undefined,
        ...(form.registerExpense ? { registerExpense: true, method: form.method } : {}),
      })
      onClose(
        `${equipment.name} marcado para ${dateBr(form.startsOn)}${form.endsOn !== form.startsOn ? ` a ${dateBr(form.endsOn)}` : ''}${form.registerExpense ? ', despesa lançada no Financeiro' : ''}.`,
      )
    } catch {
      setError('Não foi possível marcar. Confira as datas (até 2 meses por vez).')
    } finally {
      setSaving(false)
    }
  }

  const art = equipmentPresentation(equipment.name)
  const upcoming = equipment.rentals.filter((rental) => rental.endsOn >= today)
  const here = upcoming.some((rental) => rental.startsOn <= today)
  const status = here
    ? 'No espaço agora'
    : upcoming.length
      ? `Próximo aluguel: ${shortDay(upcoming[0].startsOn)}`
      : 'Sem aluguel marcado'

  return (
    <QuickModal
      isOpen
      tone="glow"
      badge="Aluguel"
      onOpenChange={(open) => !open && onClose()}
      title={equipment.name}
      subtitle="Nesses dias as clientes conseguem agendar os serviços do aparelho."
      hero={
        <>
          <div className="qm-hero-art">
            <Image src={art.image} alt="" width={220} height={220} sizes="220px" priority />
          </div>
          <ul className="qm-hero-facts">
            <li>
              <CalendarCheck size={15} aria-hidden /> {status}
            </li>
            {equipment.supplier ? (
              <li>
                <Store size={15} aria-hidden /> {equipment.supplier}
              </li>
            ) : null}
          </ul>
          {serviceNames.length ? (
            <div className="qm-hero-chips" aria-label="Serviços do aparelho">
              {serviceNames.slice(0, 3).map((service) => (
                <span key={service}>{service}</span>
              ))}
              {serviceNames.length > 3 ? <span>+{serviceNames.length - 3}</span> : null}
            </div>
          ) : null}
        </>
      }
      footer={
        <>
          {error ? (
            <span className="apt-error qm-foot-start" role="alert">
              {error}
            </span>
          ) : null}
          <Button variant="secondary" onPress={() => onClose()}>
            Cancelar
          </Button>
          <Button isDisabled={saving} onPress={() => void save()}>
            {saving ? 'Salvando…' : 'Marcar aluguel'}
          </Button>
        </>
      }
    >
      <div className="settings-grid">
        <DateInputField
          label="Chega em"
          value={form.startsOn}
          onChange={(startsOn) =>
            setForm({ ...form, startsOn, endsOn: form.endsOn < startsOn ? startsOn : form.endsOn })
          }
        />
        <DateInputField
          label="Fica até (inclusive)"
          value={form.endsOn}
          min={form.startsOn}
          onChange={(endsOn) => setForm({ ...form, endsOn })}
        />
      </div>
      <MoneyField
        className="qm-money"
        label="Valor do aluguel"
        value={form.cost}
        onChange={(cost) => setForm({ ...form, cost })}
      />
      <TextInputField
        label="Observação (opcional)"
        maxLength={240}
        placeholder="Ex.: chega às 8h, devolver até 19h"
        value={form.note}
        onChange={(note) => setForm({ ...form, note })}
      />
      {canFinance ? (
        <>
          <CheckboxField
            isSelected={form.registerExpense}
            onChange={(registerExpense) => setForm({ ...form, registerExpense })}
            label="Lançar como despesa no Financeiro"
            description="Categoria “Aluguel de aparelhos”, na data de chegada."
          />
          {form.registerExpense ? (
            <SelectField
              label="Forma de pagamento"
              value={form.method}
              onChange={(method) => setForm({ ...form, method })}
              options={methods}
            />
          ) : null}
        </>
      ) : null}
      {equipment.serviceIds.length ? null : (
        <p className="settings-footnote">Nenhum serviço ligado a este aparelho ainda.</p>
      )}
    </QuickModal>
  )
}
