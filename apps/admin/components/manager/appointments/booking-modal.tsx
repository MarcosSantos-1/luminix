'use client'

import { Button, Spinner } from '@heroui/react'
import { AlertTriangle } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import {
  DateInputField,
  SearchSelectField,
  SelectField,
  TextAreaField,
  TextInputField,
  TimeInputField,
} from '@/components/ui/fields'
import { formatBrPhone, toE164Phone } from '@/lib/phone'
import { ClinicApiError, type ClinicApi } from '../settings/clinic-api'
import { QuickModal } from '../quick-modal'
import { localDate, type BookingWarning } from './model'

export type BookingOptions = {
  clients: { id: string; display_name: string }[]
  services: { id: string; name: string; duration_minutes: number }[]
  professionals: { id: string; display_name: string }[]
  timezone: string
}

const empty = {
  clientId: '',
  serviceId: '',
  professionalId: '',
  date: '',
  time: '09:00',
  notes: '',
}

/** "Novo agendamento" as a pop-up, usable from any page (Início, Agenda, a day of the month). */
export function BookingModal({
  api,
  isOpen,
  onOpenChange,
  options,
  initialDate,
  onCreated,
}: {
  api: ClinicApi
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** Lists already loaded by the agenda; fetched here when missing. */
  options?: BookingOptions | null
  /** YYYY-MM-DD to start on. */
  initialDate?: string
  onCreated: (message: string) => void
}) {
  const [loaded, setLoaded] = useState<BookingOptions | null>(null)
  const [form, setForm] = useState(empty)
  const [warnings, setWarnings] = useState<BookingWarning[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const lists = options ?? loaded

  useEffect(() => {
    if (!isOpen) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fresh form each time it opens
    setForm({ ...empty, date: initialDate ?? localDate(new Date()) })
    setWarnings([])
    setError('')
    if (options) return
    let active = true
    const from = new Date()
    void api
      .get<BookingOptions>('agenda', {
        from: from.toISOString(),
        to: new Date(from.getTime() + 86400000).toISOString(),
      })
      .then((data) => active && setLoaded(data))
      .catch(() => active && setError('Não foi possível carregar clientes e serviços.'))
    return () => {
      active = false
    }
  }, [isOpen, initialDate, options, api])

  async function save(event?: FormEvent, confirm = false) {
    event?.preventDefault()
    if (saving) return
    if (!form.clientId || !form.serviceId || !form.date || !form.time) {
      setError('Escolha a cliente, o serviço, o dia e o horário.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.post('appointments', {
        clientId: form.clientId,
        serviceId: form.serviceId,
        professionalId: form.professionalId || undefined,
        localStartsAt: `${form.date}T${form.time}`,
        notes: form.notes,
        confirmedWarnings: confirm ? warnings.map((warning) => warning.code) : [],
      })
      const client = lists?.clients.find((item) => item.id === form.clientId)?.display_name
      onOpenChange(false)
      onCreated(
        `${client ?? 'Agendamento'} marcada para ${form.date.split('-').reverse().join('/')} às ${form.time}.`,
      )
    } catch (caught) {
      const body =
        caught instanceof ClinicApiError ? (caught.body as { warnings?: BookingWarning[] }) : null
      if (caught instanceof ClinicApiError && caught.status === 409 && body?.warnings)
        setWarnings(body.warnings)
      else setError('Não foi possível criar o agendamento.')
    } finally {
      setSaving(false)
    }
  }

  const change = (patch: Partial<typeof empty>) => {
    setForm((current) => ({ ...current, ...patch }))
    setWarnings([])
  }

  return (
    <QuickModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="lg"
      title="Novo agendamento"
      footer={
        <>
          <Button variant="secondary" onPress={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {warnings.length ? (
            <Button isDisabled={saving} onPress={() => void save(undefined, true)}>
              {saving ? 'Confirmando…' : 'Entendi, agendar mesmo assim'}
            </Button>
          ) : (
            <Button type="submit" form="manager-booking-form" isDisabled={saving || !lists}>
              {saving ? 'Verificando…' : 'Agendar'}
            </Button>
          )}
        </>
      }
    >
      {!lists && !error ? (
        <div className="ws-loading" role="status">
          <Spinner size="sm" aria-hidden /> Carregando…
        </div>
      ) : null}
      {lists ? (
        <form id="manager-booking-form" className="manager-form-grid" onSubmit={save}>
          <SearchSelectField
            className="manager-field-wide"
            label="Cliente"
            isRequired
            value={form.clientId}
            placeholder="Digite o nome da cliente"
            options={lists.clients.map((client) => ({ id: client.id, label: client.display_name }))}
            onChange={(clientId) => change({ clientId })}
          />
          <SearchSelectField
            label="Serviço"
            isRequired
            value={form.serviceId}
            placeholder="Digite o serviço"
            options={lists.services.map((service) => ({
              id: service.id,
              label: service.name,
              description: `${service.duration_minutes} min`,
            }))}
            onChange={(serviceId) => change({ serviceId })}
          />
          <SelectField
            label="Profissional"
            value={form.professionalId || 'none'}
            options={[
              { id: 'none', label: 'Sem profissional definido' },
              ...lists.professionals.map((person) => ({
                id: person.id,
                label: person.display_name,
              })),
            ]}
            onChange={(value) => change({ professionalId: value === 'none' ? '' : value })}
          />
          <DateInputField
            label="Data"
            isRequired
            value={form.date}
            onChange={(date) => change({ date })}
          />
          <TimeInputField
            label={`Horário (${lists.timezone === 'America/Sao_Paulo' ? 'Brasília' : lists.timezone})`}
            value={form.time}
            onChange={(time) => change({ time })}
          />
          <TextAreaField
            className="manager-field-wide"
            label="Observações internas"
            rows={3}
            maxLength={4000}
            value={form.notes}
            onChange={(notes) => setForm((current) => ({ ...current, notes }))}
          />
        </form>
      ) : null}
      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
      {warnings.length > 0 && (
        <div className="manager-warning-box" role="alert">
          <div>
            <AlertTriangle size={20} />
            <strong>Você está usando a chave mestra</strong>
          </div>
          {warnings.map((warning) => (
            <p key={warning.code}>
              <strong>{warning.title}.</strong> {warning.detail}
            </p>
          ))}
          <small>
            Clientes continuam sujeitos às travas; esta exceção fica registrada no agendamento.
          </small>
        </div>
      )}
    </QuickModal>
  )
}

type Duplicate = { id: string; display_name: string }

/** Quick client registration (name + WhatsApp). The full record stays on the Clientes page. */
export function QuickClientModal({
  api,
  isOpen,
  onOpenChange,
  onCreated,
  onOpenFull,
}: {
  api: ClinicApi
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (message: string) => void
  onOpenFull?: () => void
}) {
  const [form, setForm] = useState({ name: '', phone: '', birthDate: '', notes: '' })
  const [duplicates, setDuplicates] = useState<Duplicate[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fresh form each time it opens
    setForm({ name: '', phone: '', birthDate: '', notes: '' })
    setDuplicates(null)
    setError('')
  }, [isOpen])

  async function save(event?: FormEvent, confirmDuplicatePhone = false) {
    event?.preventDefault()
    if (saving) return
    const phone = form.phone ? toE164Phone(form.phone) : ''
    if (!form.name.trim()) return setError('Escreva o nome da cliente.')
    if (form.phone && !phone) return setError('Confira o WhatsApp: DDD + número.')
    setSaving(true)
    setError('')
    try {
      await api.post('clients', {
        name: form.name.trim(),
        phone,
        birthDate: form.birthDate,
        notes: form.notes,
        confirmDuplicatePhone,
      })
      onOpenChange(false)
      onCreated(`${form.name.trim()} cadastrada.`)
    } catch (caught) {
      const body =
        caught instanceof ClinicApiError ? (caught.body as { duplicates?: Duplicate[] }) : null
      if (caught instanceof ClinicApiError && caught.status === 409 && body?.duplicates?.length)
        setDuplicates(body.duplicates)
      else setError('Não foi possível cadastrar. Confira os dados e tente de novo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <QuickModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Adicionar cliente"
      subtitle="O essencial agora; CPF e o restante você completa na ficha."
      footer={
        <>
          {onOpenFull ? (
            <Button
              variant="ghost"
              className="qm-foot-start"
              onPress={() => {
                onOpenChange(false)
                onOpenFull()
              }}
            >
              Cadastro completo
            </Button>
          ) : null}
          <Button variant="secondary" onPress={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {duplicates ? (
            <Button isDisabled={saving} onPress={() => void save(undefined, true)}>
              {saving ? 'Salvando…' : 'Cadastrar mesmo assim'}
            </Button>
          ) : (
            <Button type="submit" form="manager-quick-client" isDisabled={saving}>
              {saving ? 'Salvando…' : 'Cadastrar'}
            </Button>
          )}
        </>
      }
    >
      <form id="manager-quick-client" className="manager-form-grid" onSubmit={save}>
        <TextInputField
          className="manager-field-wide"
          label="Nome"
          isRequired
          autoFocus
          maxLength={160}
          value={form.name}
          onChange={(name) => setForm({ ...form, name })}
        />
        <TextInputField
          label="WhatsApp"
          inputMode="tel"
          placeholder="(11) 98765-4321"
          value={form.phone}
          onChange={(phone) => {
            setForm({ ...form, phone: formatBrPhone(phone) })
            setDuplicates(null)
          }}
        />
        <DateInputField
          label="Nascimento"
          value={form.birthDate}
          onChange={(birthDate) => setForm({ ...form, birthDate })}
        />
        <TextAreaField
          className="manager-field-wide"
          label="Observações (alergias, cuidados)"
          rows={3}
          maxLength={4000}
          value={form.notes}
          onChange={(notes) => setForm({ ...form, notes })}
        />
      </form>
      {duplicates ? (
        <div className="manager-warning-box" role="alert">
          <div>
            <AlertTriangle size={20} />
            <strong>Este WhatsApp já está em outro cadastro</strong>
          </div>
          <p>{duplicates.map((item) => item.display_name).join(', ')}</p>
          <small>Mãe e filha podem dividir o número; confirme se é uma pessoa diferente.</small>
        </div>
      ) : null}
      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
    </QuickModal>
  )
}
