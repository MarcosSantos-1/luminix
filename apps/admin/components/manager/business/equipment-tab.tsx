'use client'

import { Button } from '@heroui/react'
import {
  CalendarCheck,
  CalendarPlus,
  Check,
  Clock3,
  Cpu,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Receipt,
  Store,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import Image from 'next/image'
import { useEffect, useState } from 'react'
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
  TimeInputField,
} from '@/components/ui/fields'
import { DayConfigModal } from '../appointments/day-config'
import type { WeeklyRow, OverrideRow } from '../appointments/schedule-modal'
import { canceledNote, confirmFlag, useCancellationGuard } from '../appointments/cancellation-guard'
import { QuickModal } from '../quick-modal'
import { type ClinicApi } from '../settings/clinic-api'
import { HelpTip } from '../settings/settings-kit'
import type { Service } from './catalog-model'
import { dateBr, money, moneyInput, parseMoney } from './format'

export type Rental = {
  id: string
  startsOn: string
  endsOn: string
  costCents: number | null
  note: string
  inFinance: boolean
  available?: boolean
  startMinute?: number | null
  durationHours?: number | null
  /** Dia exclusivo: only this device's treatments can be booked on these days. */
  exclusive?: boolean
}
export type Equipment = {
  id: string
  name: string
  supplier: string
  defaultCostCents: number | null
  status: 'active' | 'archived'
  serviceIds: string[]
  rentals: Rental[]
  /** "Deixar disponível": goes into the future banner and social post (Marketing). */
  promote?: boolean
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
 * dias os serviços ligados ficam disponíveis para a equipe e para as clientes. O custo do aluguel pode ir direto para o Financeiro.
 */
export function EquipmentTab({
  api,
  services,
  equipment,
  today,
  canManage,
  canFinance,
  onChanged,
  requestedEquipment,
  onRequestClosed,
}: {
  api: ClinicApi
  services: Service[]
  equipment: Equipment[]
  today: string
  canManage: boolean
  canFinance: boolean
  requestedEquipment?: string
  onRequestClosed: () => void
  onChanged: (message: string) => void
}) {
  const [editing, setEditing] = useState<Equipment | null>(null)
  const [existingRental, setExistingRental] = useState<Rental | null>(null)
  const [selectedEquipment, setRenting] = useState<Equipment | null>(null)
  const renting =
    selectedEquipment ??
    (canManage && requestedEquipment
      ? equipment.find((e) => e.id === requestedEquipment && e.status === 'active')
      : null)
  const [busy, setBusy] = useState('')
  const [confirmRemove, setConfirmRemove] = useState('')
  const name = (id: string) => services.find((service) => service.id === id)?.name ?? 'Serviço'
  const shown = equipment.filter((item) => item.status === 'active')
  const archived = equipment.filter((item) => item.status === 'archived')
  const { guard, dialog } = useCancellationGuard()

  async function removeRental(rental: Rental) {
    setBusy(rental.id)
    try {
      // Treatments that need the device on those days are listed and canceled on confirm.
      const result = await guard((confirm) =>
        api.post<{ financeEntryVoided: boolean; canceledAppointments?: number }>(
          `catalog/rentals/${rental.id}/remove`,
          confirmFlag(confirm),
        ),
      )
      setConfirmRemove('')
      if (result === null) return
      onChanged(
        `Aluguel de ${shortDay(rental.startsOn)} removido${result.financeEntryVoided ? ' e a despesa anulada no Financeiro' : ''}.${canceledNote(result)}`,
      )
    } catch {
      onChanged('Não foi possível remover o aluguel.')
    } finally {
      setBusy('')
    }
  }

  async function toggleExclusive(rental: Rental) {
    setBusy(rental.id)
    const exclusive = !rental.exclusive
    try {
      const result = await guard((confirm) =>
        api.post<{ canceledAppointments: number }>(`catalog/rentals/${rental.id}/exclusive`, {
          exclusive,
          ...confirmFlag(confirm),
        }),
      )
      if (result === null) return
      onChanged(
        exclusive
          ? `${shortDay(rental.startsOn)} reservado só para a locação.${canceledNote(result)}`
          : `${shortDay(rental.startsOn)} voltou a aceitar todos os tratamentos.`,
      )
    } catch {
      onChanged('Não foi possível mudar a exclusividade.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="biz-tab-body">
      {dialog}
      {canManage ? (
        <div className="eq-intro">
          <Button
            size="lg"
            className="eq-new"
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
            <Plus size={18} aria-hidden /> Novo aparelho
          </Button>
          <HelpTip title="Aparelhos alugados">
            <p>
              Laser, ultrassom microfocado, criolipólise… Cadastre o aparelho e ligue aos serviços
              que ele executa.
            </p>
            <p>
              Depois marque os dias do aluguel: só nesses dias (e nos horários escolhidos) a equipe
              e as clientes conseguem agendar esses serviços. O custo pode ir direto para o
              Financeiro.
            </p>
          </HelpTip>
        </div>
      ) : null}

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
                    {now ? (
                      <>
                        <CalendarCheck size={13} aria-hidden /> No espaço agora
                      </>
                    ) : upcoming.length ? (
                      <>
                        <CalendarPlus size={13} aria-hidden /> Chega{' '}
                        {shortDay(upcoming[0].startsOn)}
                      </>
                    ) : (
                      'Sem aluguel marcado'
                    )}
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
                        {upcoming.map((rental) => {
                          const paused = rental.available === false
                          const period =
                            rental.durationHours && rental.startMinute != null
                              ? rentalRange(rental.startMinute, rental.durationHours)
                              : 'Dia inteiro'
                          return (
                            <li
                              key={rental.id}
                              className={`eq-rental${paused ? ' is-paused' : ''}`}
                            >
                              <div className="eq-rental-top">
                                <span className="biz-day-chip">
                                  {rental.startsOn === rental.endsOn
                                    ? shortDay(rental.startsOn)
                                    : `${shortDay(rental.startsOn)} – ${shortDay(rental.endsOn)}`}
                                </span>
                                {rental.costCents != null ? (
                                  <span className="eq-rental-price">
                                    {money(rental.costCents)}
                                    {rental.inFinance ? (
                                      <Receipt size={12} aria-label="No Financeiro" />
                                    ) : null}
                                  </span>
                                ) : null}
                              </div>
                              <div className="eq-rental-info">
                                <span>
                                  <Clock3 size={13} aria-hidden /> {period}
                                </span>
                                <span className={paused ? 'is-paused' : 'is-on'}>
                                  {paused ? 'Agendamento pausado' : 'Agenda liberada'}
                                </span>
                                {rental.exclusive && !paused ? (
                                  <span className="eq-exclusive">
                                    <Lock size={12} aria-hidden /> Exclusivo
                                  </span>
                                ) : null}
                              </div>
                              {rental.note ? <p className="eq-rental-note">{rental.note}</p> : null}
                              {canManage ? (
                                confirmRemove === rental.id ? (
                                  <div className="eq-rental-confirm" role="group">
                                    <span>Excluir este aluguel?</span>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      isDisabled={busy === rental.id}
                                      onPress={() => setConfirmRemove('')}
                                    >
                                      Não
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="danger"
                                      isDisabled={busy === rental.id}
                                      onPress={() => void removeRental(rental)}
                                    >
                                      <Trash2 size={14} aria-hidden /> Excluir
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="eq-rental-actions">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      aria-label={`Editar horários de ${dateBr(rental.startsOn)}`}
                                      onPress={() => {
                                        setExistingRental(rental)
                                        setRenting(item)
                                      }}
                                    >
                                      <Pencil size={14} aria-hidden /> Editar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      aria-pressed={!paused && rental.exclusive === true}
                                      aria-label={
                                        rental.exclusive
                                          ? `Liberar outros tratamentos em ${dateBr(rental.startsOn)}`
                                          : `Reservar ${dateBr(rental.startsOn)} só para a locação`
                                      }
                                      isDisabled={busy === rental.id || paused}
                                      onPress={() => void toggleExclusive(rental)}
                                    >
                                      {rental.exclusive ? (
                                        <LockOpen size={14} aria-hidden />
                                      ) : (
                                        <Lock size={14} aria-hidden />
                                      )}{' '}
                                      {rental.exclusive ? 'Liberar dia' : 'Exclusivo'}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="eq-rental-remove"
                                      aria-label={`Excluir aluguel de ${dateBr(rental.startsOn)}`}
                                      isDisabled={busy === rental.id}
                                      onPress={() => setConfirmRemove(rental.id)}
                                    >
                                      <Trash2 size={14} aria-hidden /> Excluir
                                    </Button>
                                  </div>
                                )
                              ) : null}
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <p className="biz-row-meta">
                        Marque uma locação para liberar estes serviços na agenda.
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
                      <Button className="eq-rent" onPress={() => setRenting(item)}>
                        <CalendarPlus size={16} aria-hidden /> Marcar aluguel
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
          existing={existingRental}
          serviceNames={renting.serviceIds.map(name)}
          today={today}
          canFinance={canFinance}
          onClose={(message) => {
            setExistingRental(null)
            setRenting(null)
            onRequestClosed()
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
      promote: item.promote === true,
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
          <div className="eq-exclusive-field">
            <CheckboxField
              isSelected={item.promote === true}
              onChange={(promote) => setItem({ ...item, promote })}
              label="Deixar disponível"
              description="Mostrar este aparelho na divulgação do espaço."
            />
            <HelpTip title="Deixar disponível">
              <p>
                Com a opção marcada, o aparelho entra na divulgação: em breve vamos montar um banner
                (formato 2:1) para a página das clientes e um post para as redes sociais do espaço,
                com as datas da locação.
              </p>
              <p>Isso não muda a agenda: os horários continuam definidos em cada aluguel.</p>
            </HelpTip>
          </div>
        </div>
      )}
    </QuickModal>
  )
}

function minuteClock(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}
function rentalRange(start: number, hours: number) {
  return `${minuteClock(start)} às ${minuteClock(start + hours * 60)}`
}

type DaySchedule = {
  weeklyAvailability: WeeklyRow[]
  overrides: OverrideRow[]
  closures?: { professional_id: string | null; starts_on: string; ends_on: string }[]
  canManageHours: boolean
}

function RentalDayHours({ api, date }: { api: ClinicApi; date: string }) {
  const [loaded, setLoaded] = useState<{ date: string; data?: DaySchedule }>()
  const [editing, setEditing] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!date) return
    let active = true
    void api
      .get<DaySchedule>('agenda', { from: date + 'T00:00:00Z', to: date + 'T23:59:59Z' })
      .then((data) => active && setLoaded({ date, data }))
      .catch(() => active && setLoaded({ date }))
    return () => {
      active = false
    }
  }, [api, date, revision])
  if (!date || loaded?.date !== date) return null
  const data = loaded.data
  if (!data)
    return (
      <p className="settings-footnote">
        Expediente indisponível.{' '}
        <button type="button" onClick={() => setRevision((n) => n + 1)}>
          Tentar novamente
        </button>
      </p>
    )
  const override = data.overrides.find((row) => row.local_date.slice(0, 10) === date)
  const day =
    override ??
    data.weeklyAvailability.find(
      (row) => Number(row.weekday) === new Date(date + 'T12:00:00').getDay(),
    )
  const closure = data.closures?.some(
    (row) => row.professional_id === null && row.starts_on <= date && row.ends_on >= date,
  )
  return (
    <div className="eq-day-hours">
      <strong>Expediente de {shortDay(date)}</strong>
      <span>
        {closure
          ? 'Fechamento do espaço'
          : day?.is_available && day.periods.length
            ? day.periods.map((p) => p.start + ' às ' + p.end).join(' · ')
            : 'Espaço fechado'}
      </span>
      {data.canManageHours && (
        <Button variant="secondary" size="sm" onPress={() => setEditing(true)}>
          Alterar só este dia
        </Button>
      )}
      {editing && (
        <DayConfigModal
          api={api}
          date={date}
          weekly={data.weeklyAvailability}
          override={override}
          closures={closure ? ['Fechamento do espaço'] : []}
          canManage={data.canManageHours}
          onSaved={() => setRevision((n) => n + 1)}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}

function RentalEditor({
  api,
  existing,
  equipment,
  serviceNames,
  today,
  canFinance,
  onClose,
}: {
  existing: Rental | null
  api: ClinicApi
  equipment: Equipment
  serviceNames: string[]
  today: string
  canFinance: boolean
  onClose: (message?: string) => void
}) {
  const [form, setForm] = useState({
    startsOn: existing?.startsOn ?? today,
    endsOn: existing?.endsOn ?? today,
    available: existing?.available ?? true,
    duration: existing?.durationHours?.toString() ?? 'full',
    start: minuteClock(existing?.startMinute ?? 540),
    cost: equipment.defaultCostCents != null ? moneyInput(equipment.defaultCostCents) : '',
    note: '',
    registerExpense: !existing && canFinance && equipment.defaultCostCents != null,
    method: 'pix',
    exclusive: false,
  })
  const [specificDay, setSpecificDay] = useState('')
  const firstDay = form.startsOn < today ? today : form.startsOn
  const day = specificDay >= firstDay && specificDay <= form.endsOn ? specificDay : firstDay
  const startMinute = form.start
    ? Number(form.start.slice(0, 2)) * 60 + Number(form.start.slice(3))
    : NaN
  const duration = form.duration === 'full' ? null : Number(form.duration)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { guard, dialog } = useCancellationGuard()

  async function save() {
    if ((!existing && form.startsOn < today) || !form.endsOn || form.endsOn < form.startsOn)
      return setError('Confira as datas.')
    if (duration && (!Number.isInteger(startMinute) || startMinute + duration * 60 > 1440))
      return setError('Escolha um início que permita concluir a locação até meia-noite.')
    const availability = {
      available: form.available,
      ...(duration ? { startMinute, durationHours: duration } : {}),
    }
    const cents = form.cost ? parseMoney(form.cost) : null
    if (form.cost && !cents) return setError('Confira o valor.')
    if (form.registerExpense && !cents) return setError('Informe o valor para lançar a despesa.')
    setSaving(true)
    setError('')
    try {
      const saved = await guard((confirm) =>
        existing
          ? api.post<{ canceledAppointments?: number }>(
              `catalog/rentals/${existing.id}/availability`,
              { ...availability, ...confirmFlag(confirm) },
            )
          : api.post<{ canceledAppointments?: number }>(
              `catalog/equipment/${equipment.id}/rentals`,
              {
                ...availability,
                startsOn: form.startsOn,
                endsOn: form.endsOn,
                costCents: cents,
                note: form.note.trim() || undefined,
                ...(form.registerExpense ? { registerExpense: true, method: form.method } : {}),
                ...(form.available && form.exclusive ? { exclusive: true } : {}),
                ...confirmFlag(confirm),
              },
            ),
      )
      // Went back from the list of clients the exclusive day would cancel.
      if (saved === null) return
      onClose(
        existing
          ? `Disponibilidade de ${equipment.name} atualizada.${canceledNote(saved)}`
          : `${equipment.name} marcado para ${dateBr(form.startsOn)}${form.endsOn !== form.startsOn ? ` a ${dateBr(form.endsOn)}` : ''}${form.available && form.exclusive ? ', dia exclusivo' : ''}${form.registerExpense ? ', despesa lançada no Financeiro' : ''}.${canceledNote(saved)}`,
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
      subtitle="Escolha quando a equipe e as clientes poderão agendar os tratamentos deste aparelho."
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
            {saving ? 'Salvando…' : existing ? 'Salvar disponibilidade' : 'Marcar aluguel'}
          </Button>
        </>
      }
    >
      <div className="settings-grid">
        <DateInputField
          label="Chega em"
          isDisabled={Boolean(existing)}
          min={today}
          value={form.startsOn}
          onChange={(startsOn) =>
            setForm({ ...form, startsOn, endsOn: form.endsOn < startsOn ? startsOn : form.endsOn })
          }
        />
        <DateInputField
          label="Fica até (inclusive)"
          isDisabled={Boolean(existing)}
          value={form.endsOn}
          min={form.startsOn > today ? form.startsOn : today}
          onChange={(endsOn) => setForm({ ...form, endsOn })}
        />
      </div>
      <div className="settings-grid">
        <SelectField
          label="Período do aparelho"
          value={form.duration}
          onChange={(duration) => setForm({ ...form, duration })}
          options={[
            { id: 'full', label: 'Dia inteiro' },
            ...[4, 6, 8, 10].map((hours) => ({
              id: String(hours),
              label: `${hours} horas por dia`,
            })),
          ]}
        />
        {duration && (
          <TimeInputField
            label="Início da locação"
            value={form.start}
            onChange={(start) => setForm({ ...form, start })}
            description={
              Number.isInteger(startMinute) && startMinute + duration * 60 <= 1440
                ? `Até ${minuteClock(startMinute + duration * 60)}`
                : undefined
            }
          />
        )}
      </div>
      {form.endsOn > firstDay && (
        <DateInputField
          label="Consultar expediente do dia"
          value={day}
          min={firstDay}
          max={form.endsOn}
          onChange={setSpecificDay}
        />
      )}
      <RentalDayHours api={api} date={day} />
      <CheckboxField
        label="Liberar agendamento nesta locação"
        isSelected={form.available}
        onChange={(available) => setForm({ ...form, available })}
        description="Libera os tratamentos nos horários da locação que cabem no expediente, respeitando os intervalos."
      />
      {!existing && (
        <>
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
          <div className="eq-exclusive-field">
            <CheckboxField
              isDisabled={!form.available}
              isSelected={form.exclusive}
              onChange={(exclusive) => setForm({ ...form, exclusive })}
              label="Dia exclusivo para esta locação"
              description="Nesses dias as clientes só conseguem marcar os tratamentos deste aparelho."
            />
            <HelpTip title="Dia exclusivo">
              <p>
                Aparelho alugado custa por dia. Para aproveitar 100% do equipamento, você pode
                reservar o dia inteiro só para os tratamentos dele.
              </p>
              <p>
                Com a opção marcada, as clientes não veem horários de outros tratamentos nesses
                dias. A equipe ainda consegue agendar outro serviço, mas a agenda avisa que o dia
                está reservado à locação.
              </p>
              <p>
                Se já houver outros tratamentos marcados, mostramos as clientes afetadas antes de
                salvar. Confirmando, os horários são cancelados e cada uma recebe o aviso.
              </p>
            </HelpTip>
          </div>
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
        </>
      )}
      {equipment.serviceIds.length ? null : (
        <p className="settings-footnote">Nenhum serviço ligado a este aparelho ainda.</p>
      )}
      {dialog}
    </QuickModal>
  )
}
