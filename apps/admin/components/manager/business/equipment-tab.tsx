'use client'

import { Button } from '@heroui/react'
import {
  Archive,
  CalendarPlus,
  Cpu,
  Pencil,
  Plus,
  Receipt,
  Store,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { useState } from 'react'
import {
  CheckboxField,
  DateInputField,
  MoneyField,
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

  async function archive(item: Equipment) {
    setBusy(item.id)
    try {
      await api.post(`catalog/equipment/${item.id}/archive`, {})
      onChanged(`${item.name} arquivado. Os serviços ligados saem da agenda das clientes.`)
    } catch {
      onChanged('Não foi possível arquivar.')
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
        <ul className="biz-grid biz-devices">
          {shown.map((item) => {
            const upcoming = item.rentals.filter((rental) => rental.endsOn >= today)
            const past = item.rentals.filter((rental) => rental.endsOn < today).slice(-2)
            return (
              <li key={item.id} className="biz-tile biz-device">
                <div className="biz-tile-head">
                  <span className="biz-tile-icon" aria-hidden>
                    <Cpu size={20} />
                  </span>
                  <div className="biz-tile-title">
                    <strong title={item.name}>{item.name}</strong>
                    <span className="biz-row-meta">
                      <Store size={13} aria-hidden /> {item.supplier || 'Fornecedor não informado'}
                    </span>
                  </div>
                  {item.defaultCostCents != null ? (
                    <div className="biz-price">
                      <strong>{money(item.defaultCostCents)}</strong>
                      <small>por aluguel</small>
                    </div>
                  ) : null}
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
                <div className="biz-device-days">
                  <small>Próximos aluguéis</small>
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
                      Nenhum dia marcado: as clientes não conseguem agendar esses serviços.
                    </p>
                  )}
                  {past.length ? (
                    <p className="biz-row-meta">
                      Últimos: {past.map((rental) => shortDay(rental.startsOn)).join(', ')}
                    </p>
                  ) : null}
                </div>
                {canManage ? (
                  <div className="biz-tile-actions">
                    <Button size="sm" onPress={() => setRenting(item)}>
                      <CalendarPlus size={14} aria-hidden /> Marcar aluguel
                    </Button>
                    <Button size="sm" variant="secondary" onPress={() => setEditing(item)}>
                      <Pencil size={14} aria-hidden /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      isDisabled={busy === item.id}
                      onPress={() => void archive(item)}
                    >
                      <Archive size={14} aria-hidden /> Arquivar
                    </Button>
                  </div>
                ) : null}
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

function EquipmentEditor({
  api,
  initial,
  services,
  onClose,
}: {
  api: ClinicApi
  initial: Equipment
  services: Service[]
  onClose: (message?: string) => void
}) {
  const [item, setItem] = useState(initial)
  const [cost, setCost] = useState(
    initial.defaultCostCents != null ? moneyInput(initial.defaultCostCents) : '',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isNew = !initial.id
  const categories = [...new Set(services.map((service) => service.category))]

  async function save() {
    if (!item.name.trim()) return setError('Escreva o nome do aparelho.')
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

  return (
    <QuickModal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={isNew ? 'Novo aparelho alugado' : `Editar ${initial.name}`}
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
            {saving ? 'Salvando…' : isNew ? 'Cadastrar' : 'Salvar'}
          </Button>
        </>
      }
    >
      <TextInputField
        label="Aparelho"
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
        <MoneyField label="Valor de costume por aluguel" value={cost} onChange={setCost} />
      </div>
      <div className="biz-device-pick">
        <strong>Serviços que usam este aparelho</strong>
        <small>Eles passam a depender dos dias de aluguel para as clientes agendarem.</small>
        {categories.map((category) => (
          <fieldset key={category}>
            <legend>{category}</legend>
            {services
              .filter((service) => service.category === category)
              .map((service) => (
                <CheckboxField
                  key={service.id}
                  label={service.name}
                  isSelected={item.serviceIds.includes(service.id)}
                  onChange={(on) =>
                    setItem({
                      ...item,
                      serviceIds: on
                        ? [...item.serviceIds, service.id]
                        : item.serviceIds.filter((id) => id !== service.id),
                    })
                  }
                />
              ))}
          </fieldset>
        ))}
      </div>
      <p className="settings-footnote">
        Dica: em Serviços, marque esses serviços como “Depende de aparelho ou sala”.
      </p>
    </QuickModal>
  )
}

function RentalEditor({
  api,
  equipment,
  today,
  canFinance,
  onClose,
}: {
  api: ClinicApi
  equipment: Equipment
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

  return (
    <QuickModal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Aluguel · ${equipment.name}`}
      subtitle="Nesses dias as clientes conseguem agendar os serviços do aparelho."
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
