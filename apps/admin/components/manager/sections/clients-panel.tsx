'use client'

import { Button, Modal } from '@heroui/react'
import {
  Archive,
  ArchiveRestore,
  Cake,
  CalendarClock,
  CalendarPlus,
  Check,
  ClipboardCheck,
  Gift,
  History,
  IdCard,
  MessageCircle,
  NotebookPen,
  Package,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  FileText,
  Mail,
  TicketPercent,
  UserRound,
  UserRoundPlus,
  UserRoundX,
  UsersRound,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { Answers, Level } from '@luminix/contracts/anamnesis'
import { formatBrPhone, toE164Phone } from '@/lib/phone'
import { isValidBrazilianTaxId } from '@/lib/tax-id'
import { CheckboxField, SearchInput } from '@/components/ui/fields'
import { ClientAvatar } from '../appointments/appointment-sheet'
import { BookingModal } from '../appointments/booking-modal'
import { dateBr, money, whatsapp } from '../business/format'
import {
  AnamnesisBadge,
  AnamnesisStep,
  AnamnesisView,
  anamnesisState,
  levelNames,
  staffStepComplete,
  staffSteps,
  type AnamnesisSummary,
  type StaffAnamnesis,
} from '../clients/anamnesis'
import {
  ClientCreateSteps,
  phoneOk,
  stepsFor,
  type CreateStep,
} from '../clients/client-create-steps'
import { useKeyboardAwareSheet, useNoKeyboardOnOpen } from '../quick-modal'
import { FilterMenu, KpiCards, type FilterValue } from '../data-kit'
import { QuickModal } from '../quick-modal'
import { VoucherModal } from '../clients/voucher-modal'
import { ClinicApiError, useClinicApi, type ClinicApi } from '../settings/clinic-api'
import { useSearchFocus, type SearchFocus } from '../workspace/workspace-signals'
import { ToastNotice } from '@/components/ui/toast-notice'
import {
  PackageProgress,
  type ClientPackage as ClientPackageView,
} from '../business/package-progress'

// Biological sex (waxing, intimate treatments), not gender identity.
type Sex = 'female' | 'male'

type Client = {
  id: string
  display_name: string
  contact_phone: string | null
  contact_email: string | null
  birth_date: string | null
  notes: string | null
  status: 'active' | 'archived'
  created_at: string
  sex: Sex | null
  marketing_opt_in: boolean
  linked: boolean
  tax_id_masked: string | null
  appointment_count: number
  completed_count: number
  /** Null when the person cannot see money (no Financeiro permission). */
  spent_cents: number | null
  last_visit_at: string | null
  next_visit_at: string | null
  /** Signed, short-lived URL of the client's photo. */
  photo_url?: string | null
  photo_large_url?: string | null
  /** Sent by the client through the client area; loaded on demand. */
  account_photo?: boolean
  /** Level, date and who filled the anamnese (no answers in the list). */
  anamnesis?: AnamnesisSummary
}

type ClientDetail = { tax_id: string | null }

type HistoryItem = {
  id: string
  starts_at: string
  status: string
  service_name: string
  professional_name: string | null
  price_cents: number | null
  price_type?: string
  paid?: boolean
  paid_cents?: number | null
  paid_method?: string | null
  status_note?: string | null
  previous_starts_at?: string | null
  rescheduled_at?: string | null
  package_name?: string | null
  package_sessions?: number | null
  package_session?: number | null
  /** Receipt of an in-app (Stripe) payment, when there is one. */
  receipt_url?: string | null
}

type Duplicate = { id: string; display_name: string; status: string }

const emptyForm = {
  name: '',
  phone: '',
  email: '',
  taxId: '',
  sex: '' as Sex | '',
  birthDate: '',
  marketingOptIn: false,
  notes: '',
}

const statusLabels: Record<string, string> = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  canceled: 'Cancelado',
  no_show: 'Faltou',
}

const DAY = 86400000
const defaultFilters: FilterValue = { status: ['active', 'archived'], only: [] }
const sortOptions = [
  { id: 'name', label: 'Nome (A–Z)' },
  { id: 'recent', label: 'Cadastro mais recente' },
  { id: 'visit', label: 'Última visita' },
  { id: 'spent', label: 'Quem mais gastou' },
  { id: 'count', label: 'Mais atendimentos' },
]

const shortDate = (iso: string) => new Intl.DateTimeFormat('pt-BR').format(new Date(iso))

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
}

/** Named checks shared by the KPI cards and the "Filtros" menu. */
function clientChecks(now: number) {
  const month = new Date(now).getMonth()
  return {
    visited: (c: Client) => c.completed_count > 0,
    never: (c: Client) => c.appointment_count === 0,
    fresh: (c: Client) => now - new Date(c.created_at).getTime() < 30 * DAY,
    upcoming: (c: Client) => Boolean(c.next_visit_at),
    away: (c: Client) =>
      c.status === 'active' &&
      !c.next_visit_at &&
      Boolean(c.last_visit_at) &&
      now - new Date(c.last_visit_at!).getTime() > 60 * DAY,
    birthday: (c: Client) =>
      Boolean(c.birth_date) && Number(c.birth_date!.slice(5, 7)) - 1 === month,
    messages: (c: Client) => c.marketing_opt_in,
    linked: (c: Client) => c.linked,
  } satisfies Record<string, (client: Client) => boolean>
}

export function ClientsPanel({
  clinicId,
  createSignal = 0,
  focus,
}: {
  clinicId: string
  /** Kept for callers; the pop-up no longer repeats the space name. */
  clinicName?: string
  createSignal?: number
  focus?: SearchFocus | null
}) {
  const api = useClinicApi(clinicId)
  const [clients, setClients] = useState<Client[]>([])
  const [canIssueVouchers, setCanIssueVouchers] = useState(false)
  const [canSeeMoney, setCanSeeMoney] = useState(false)
  const [query, setQuery] = useState('')
  useSearchFocus(focus, setQuery)
  const [filters, setFilters] = useState<FilterValue>(defaultFilters)
  const [sort, setSort] = useState('name')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [open, setOpen] = useState(false)
  const [voucherClient, setVoucherClient] = useState<Client | null | undefined>(undefined)
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<{ id: string; status: 'active' | 'archived' } | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [duplicates, setDuplicates] = useState<Duplicate[] | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ taxId?: string; email?: string }>({})
  const [saving, setSaving] = useState(false)
  const [mountedAt] = useState(() => Date.now())
  const [sheet, setSheet] = useState<{ id: string; from: DOMRect | null } | null>(null)
  const [history, setHistory] = useState<HistoryItem[] | null>(null)
  const [sheetDetail, setSheetDetail] = useState<{
    record: StaffAnamnesis | null
    shared: boolean
  } | null>(null)
  const [requiredLevel, setRequiredLevel] = useState<Level>(1)
  // Optional anamnese inside "Adicionar cliente": -1 = personal data, then one step per screen.
  const [intake, setIntake] = useState<{
    on: boolean
    index: number
    answers: Answers
    consent: boolean
  }>({ on: false, index: -1, answers: {}, consent: false })
  const [booking, setBooking] = useState<string | null>(null)
  // "Adicionar cliente" goes one subject per screen; editing keeps the full form.
  const [createStep, setCreateStep] = useState<CreateStep>('who')
  const steps = stepsFor(Boolean(editing))
  const canSave = Boolean(form.name.trim()) && phoneOk(form.phone)
  useNoKeyboardOnOpen(open)
  useKeyboardAwareSheet(open)
  const photoInput = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')

  async function changePhoto(clientId: string, file: File | null) {
    if (photoBusy) return
    setPhotoBusy(true)
    setPhotoError('')
    try {
      if (file) await api.upload('client_photo', file, clientId)
      else await api.put(`clients/${clientId}/photo`, { remove: true })
      await load()
    } catch (caught) {
      setPhotoError(
        caught instanceof Error && !(caught instanceof ClinicApiError) && file
          ? caught.message
          : 'Não foi possível atualizar a foto. Tente de novo.',
      )
    } finally {
      setPhotoBusy(false)
    }
  }

  const statuses = filters.status ?? []
  const status = statuses.length === 1 ? statuses[0] : 'all'

  async function load(active: () => boolean = () => true) {
    if (!api.ready) return
    setLoading(true)
    setError('')
    try {
      const body = await api.get<{
        clients: Client[]
        canSeeMoney?: boolean
        canIssueVouchers?: boolean
        anamnesisLevel?: number
      }>('clients', {
        status,
        ...(query.trim() ? { q: query.trim() } : {}),
      })
      if (!active()) return
      setClients(body.clients)
      setCanSeeMoney(body.canSeeMoney === true)
      setCanIssueVouchers(body.canIssueVouchers === true)
      setRequiredLevel(Math.min(3, Math.max(1, body.anamnesisLevel ?? 1)) as Level)
    } catch {
      if (active()) setError('Não foi possível carregar os clientes deste espaço.')
    } finally {
      if (active()) setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    const timeout = window.setTimeout(() => void load(() => active), 220)
    return () => {
      active = false
      window.clearTimeout(timeout)
    }
    // load is intentionally scoped to the latest query/filter values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, query, status])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setDuplicates(null)
    setFieldErrors({})
    setError('')
    setIntake({ on: false, index: -1, answers: {}, consent: false })
    setCreateStep('who')
    setOpen(true)
  }

  useEffect(() => {
    if (!createSignal) return
    const timeout = window.setTimeout(openCreate, 0)
    return () => window.clearTimeout(timeout)
  }, [createSignal])

  async function openSheet(client: Client, from: DOMRect | null) {
    setSheet({ id: client.id, from })
    setHistory(null)
    setSheetDetail(null)
    await loadDetail(client.id)
  }

  async function loadDetail(id: string) {
    try {
      const body = await api.get<{
        history: HistoryItem[]
        anamnesis?: { record: StaffAnamnesis | null; shared: boolean; requiredLevel?: number }
      }>(`clients/${id}`)
      setHistory(body.history)
      setSheetDetail({
        record: body.anamnesis?.record ?? null,
        shared: body.anamnesis?.shared === true,
      })
    } catch {
      setHistory([])
      setSheetDetail({ record: null, shared: false })
    }
  }

  async function openEdit(client: Client) {
    setSheet(null)
    setEditing({ id: client.id, status: client.status })
    setForm({
      name: client.display_name,
      phone: client.contact_phone ? formatBrPhone(client.contact_phone) : '',
      email: client.contact_email ?? '',
      taxId: '',
      sex: client.sex ?? '',
      birthDate: client.birth_date?.slice(0, 10) ?? '',
      marketingOptIn: client.marketing_opt_in,
      notes: client.notes ?? '',
    })
    setDuplicates(null)
    setFieldErrors({})
    setError('')
    setIntake({ on: false, index: -1, answers: {}, consent: false })
    setCreateStep('who')
    setLoadingDetail(true)
    setOpen(true)
    try {
      const body = await api.get<{ client: ClientDetail }>(`clients/${client.id}`)
      // The list only has a masked CPF; the whole number comes from the detail record.
      setForm((current) => ({ ...current, taxId: formatCpf(body.client.tax_id ?? '') }))
    } catch {
      setError('Não foi possível carregar a ficha completa. Feche e tente novamente.')
    } finally {
      setLoadingDetail(false)
    }
  }

  async function submit(event?: FormEvent, confirmDuplicatePhone = false) {
    event?.preventDefault()
    if (saving || loadingDetail) return
    setError('')
    setFieldErrors({})
    if (!form.name.trim() || !phoneOk(form.phone)) {
      setError('Informe o nome e o WhatsApp com DDD.')
      setCreateStep('who')
      return
    }
    const taxDigits = form.taxId.replace(/\D/g, '')
    if (taxDigits && !isValidBrazilianTaxId('cpf', taxDigits)) {
      setFieldErrors({ taxId: 'Confira o CPF informado.' })
      setCreateStep('about')
      return
    }
    setSaving(true)
    const payload = {
      name: form.name,
      phone: form.phone ? toE164Phone(form.phone) || form.phone : '',
      email: form.email,
      birthDate: form.birthDate,
      notes: form.notes,
      taxId: taxDigits,
      ...(form.sex ? { sex: form.sex } : {}),
      marketingOptIn: form.marketingOptIn,
      confirmDuplicatePhone,
    }
    const fallback = editing
      ? 'Não foi possível salvar as alterações.'
      : 'Não foi possível cadastrar a cliente.'
    try {
      let message = editing ? 'Cadastro atualizado.' : `${form.name.trim()} cadastrada.`
      if (editing) await api.put(`clients/${editing.id}`, payload)
      else {
        const created = await api.post<{ client: { id: string } }>('clients', payload)
        if (intake.on) {
          try {
            await api.put(`clients/${created.client.id}/anamnesis`, {
              level: requiredLevel,
              answers: intake.answers,
              consent: true,
            })
            message = `${form.name.trim()} cadastrada com anamnese preenchida.`
          } catch {
            message = `${form.name.trim()} cadastrada. A anamnese não foi salva: preencha pela ficha.`
          }
        }
      }
      setOpen(false)
      setDuplicates(null)
      setNotice(message)
      await load()
    } catch (caught) {
      const body =
        caught instanceof ClinicApiError
          ? (caught.body as {
              error?: string
              duplicates?: Duplicate[]
              client?: { display_name?: string }
            } | null)
          : null
      if (body?.error === 'Client requires confirmation') setDuplicates(body.duplicates ?? [])
      else if (body?.error === 'Tax id already registered') {
        setFieldErrors({
          taxId: `Este CPF já está cadastrado${body.client?.display_name ? ` para ${body.client.display_name}` : ''}.`,
        })
        setCreateStep('about')
      } else if (body?.error === 'Invalid email') {
        setFieldErrors({ email: 'Confira o e-mail informado.' })
        setCreateStep('contact')
      } else if (body?.error === 'Invalid tax id') {
        setFieldErrors({ taxId: 'Confira o CPF informado.' })
        setCreateStep('about')
      } else
        setError(body?.error === 'Invalid birth date' ? 'Confira a data de nascimento.' : fallback)
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(id: string, next: 'active' | 'archived') {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await api.put(`clients/${id}/status`, { status: next })
      setOpen(false)
      setSheet(null)
      setNotice(next === 'archived' ? 'Cliente arquivada.' : 'Cliente reativada.')
      await load()
    } catch {
      setError('Não foi possível alterar a situação desta cliente.')
    } finally {
      setSaving(false)
    }
  }

  const checks = useMemo(() => clientChecks(mountedAt), [mountedAt])
  const only = (filters.only ?? []) as (keyof typeof checks)[]
  const visible = useMemo(() => {
    const rows = clients.filter((client) => only.every((id) => checks[id]?.(client) ?? true))
    const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0)
    const by: Record<string, (a: Client, b: Client) => number> = {
      recent: (a, b) => time(b.created_at) - time(a.created_at),
      visit: (a, b) => time(b.last_visit_at) - time(a.last_visit_at),
      spent: (a, b) => (b.spent_cents ?? 0) - (a.spent_cents ?? 0),
      count: (a, b) => b.completed_count - a.completed_count,
    }
    return by[sort] ? [...rows].sort(by[sort]) : rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, filters.only, sort, checks])

  const count = (id: keyof typeof checks) => clients.filter(checks[id]).length
  const activeFilters = only.length + (statuses.length === 1 ? 1 : 0)
  const toggleOnly = (id: string) =>
    setFilters((current) => ({
      ...current,
      only: id === 'all' ? [] : current.only?.length === 1 && current.only[0] === id ? [] : [id],
    }))
  const selected = sheet ? clients.find((client) => client.id === sheet.id) : null
  const intakeSteps = intake.on ? staffSteps(requiredLevel, intake.answers) : []
  const intakeStep = intake.index >= 0 ? intakeSteps[intake.index] : undefined
  const intakeAtEnd = intake.on && intake.index >= intakeSteps.length
  function startIntake() {
    if (!form.name.trim()) {
      setError('Escreva o nome da cliente para continuar.')
      return
    }
    setError('')
    // Sex and birth date typed in the form already answer the first step.
    setIntake((current) => ({
      ...current,
      index: 0,
      answers: {
        ...current.answers,
        ...(form.sex ? { sex: form.sex } : {}),
        ...(form.birthDate ? { birthDate: form.birthDate } : {}),
      },
    }))
  }
  const totalSpent = clients.reduce((sum, client) => sum + (client.spent_cents ?? 0), 0)

  return (
    <div className="manager-section manager-data-section biz-stack">
      <KpiCards
        label="Resumo de clientes"
        active={only.length === 1 ? only[0] : only.length ? '' : 'all'}
        onSelect={toggleOnly}
        items={[
          {
            id: 'all',
            label: 'Clientes',
            value: clients.length,
            hint: canSeeMoney
              ? `${money(totalSpent)} em atendimentos`
              : `${count('visited')} já atendidas`,
            icon: <UsersRound size={22} />,
          },
          {
            id: 'fresh',
            label: 'Novas',
            value: count('fresh'),
            hint: 'Cadastradas em 30 dias',
            icon: <UserRoundPlus size={22} />,
            tone: 'good',
          },
          {
            id: 'away',
            label: 'Sumidas',
            value: count('away'),
            hint: 'Mais de 60 dias sem vir',
            icon: <UserRoundX size={22} />,
            tone: 'warn',
          },
          {
            id: 'birthday',
            label: 'Aniversário no mês',
            value: count('birthday'),
            hint: 'Boa hora para um mimo',
            icon: <Cake size={22} />,
          },
        ]}
      />

      <div className="data-toolbar">
        <div className="data-searchbar">
          <SearchInput
            className="data-search lx-search-bar"
            ariaLabel="Buscar clientes"
            placeholder="Nome, telefone, e-mail ou CPF"
            value={query}
            onChange={setQuery}
          />
          <FilterMenu
            iconOnly
            sort={{
              value: sort,
              onChange: setSort,
              options: canSeeMoney ? sortOptions : sortOptions.filter(({ id }) => id !== 'spent'),
            }}
            value={filters}
            onChange={setFilters}
            activeCount={activeFilters}
            onClear={() => setFilters(defaultFilters)}
            groups={[
              {
                id: 'status',
                label: 'Situação',
                options: [
                  { id: 'active', label: 'Ativas' },
                  { id: 'archived', label: 'Arquivadas' },
                ],
              },
              {
                id: 'only',
                label: 'Mostrar apenas',
                options: [
                  { id: 'visited', label: 'Já atendidas', count: count('visited') },
                  { id: 'never', label: 'Sem atendimento ainda', count: count('never') },
                  { id: 'fresh', label: 'Novas (30 dias)', count: count('fresh') },
                  { id: 'upcoming', label: 'Com horário marcado', count: count('upcoming') },
                  { id: 'away', label: 'Sumidas (60+ dias)', count: count('away') },
                  { id: 'birthday', label: 'Aniversário neste mês', count: count('birthday') },
                  { id: 'messages', label: 'Aceitam mensagens', count: count('messages') },
                  { id: 'linked', label: 'Com conta Luminix', count: count('linked') },
                ],
              },
            ]}
          />
        </div>
        {canIssueVouchers ? (
          <Button
            className="cli-voucher"
            variant="secondary"
            onPress={() => setVoucherClient(null)}
          >
            <TicketPercent size={18} /> Voucher
          </Button>
        ) : null}
        <Button data-manager-spotlight="add-client" onPress={openCreate}>
          <Plus size={18} /> Adicionar cliente
        </Button>
      </div>

      <ToastNotice message={notice} onShown={() => setNotice('')} />
      {error && !open && (
        <p className="manager-data-error" role="alert">
          {error}
        </p>
      )}

      {loading && !clients.length ? (
        <ul className="cli-grid" role="status" aria-label="Carregando clientes">
          {Array.from({ length: 6 }, (_, index) => (
            <li key={index} className="cli-card" aria-hidden="true">
              <div className="manager-skeleton-row">
                <div className="manager-skeleton manager-skeleton-avatar" />
                <div className="manager-skeleton-lines">
                  <div className="manager-skeleton manager-skeleton-line" />
                  <div className="manager-skeleton manager-skeleton-line is-short" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : visible.length ? (
        <>
          <span className="data-count">
            {visible.length === clients.length
              ? `${clients.length} ${clients.length === 1 ? 'cliente' : 'clientes'}`
              : `${visible.length} de ${clients.length} clientes`}
          </span>
          <ul className="cli-grid">
            {visible.map((client) => (
              <li key={client.id}>
                <button
                  type="button"
                  className={`cli-card${client.status === 'archived' ? ' is-archived' : ''}`}
                  aria-label={`Abrir ficha de ${client.display_name}`}
                  onClick={(event) =>
                    void openSheet(client, event.currentTarget.getBoundingClientRect())
                  }
                >
                  <span className="cli-head">
                    <ClientAvatar
                      name={client.display_name}
                      photoUrl={client.photo_url}
                      account={client.account_photo ? { api, clientId: client.id } : null}
                    />
                    <span className="cli-name">
                      <strong>{client.display_name}</strong>
                      <span>
                        {client.contact_phone ? (
                          <>
                            <Phone size={13} aria-hidden /> {formatBrPhone(client.contact_phone)}
                          </>
                        ) : (
                          (client.contact_email ?? 'Sem contato informado')
                        )}
                      </span>
                    </span>
                  </span>
                  <ClientTags client={client} checks={checks} />
                  <dl className="cli-metrics">
                    <div>
                      <dt>Atendimentos</dt>
                      <dd>{client.completed_count}</dd>
                    </div>
                    <div>
                      <dt>Última visita</dt>
                      <dd>{client.last_visit_at ? shortDate(client.last_visit_at) : '—'}</dd>
                    </div>
                    <div>
                      <dt>{client.spent_cents != null ? 'Total gasto' : 'Próximo'}</dt>
                      <dd>
                        {client.spent_cents != null
                          ? money(client.spent_cents)
                          : client.next_visit_at
                            ? shortDate(client.next_visit_at)
                            : '—'}
                      </dd>
                    </div>
                  </dl>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="manager-empty-real">
          <UserRound size={28} />
          <strong>
            {query || activeFilters
              ? 'Nenhuma cliente encontrada'
              : 'Sua lista de clientes começa aqui'}
          </strong>
          <p>
            {query || activeFilters
              ? 'Tente outro nome ou limpe os filtros.'
              : 'Cadastre a primeira cliente sem criar uma conta no aplicativo para ela.'}
          </p>
          {activeFilters ? (
            <Button variant="secondary" onPress={() => setFilters(defaultFilters)}>
              Limpar filtros
            </Button>
          ) : !query ? (
            <Button onPress={openCreate}>Adicionar cliente</Button>
          ) : null}
        </div>
      )}

      <QuickModal
        isOpen={Boolean(selected)}
        onOpenChange={(next) => !next && setSheet(null)}
        size="lg"
        morph={sheet?.from}
        className="sh cli-sheet"
        title={
          selected ? (
            <span className="sh-head">
              <ClientAvatar
                name={selected.display_name}
                photoUrl={selected.photo_url}
                largeUrl={selected.photo_large_url}
                account={selected.account_photo ? { api, clientId: selected.id } : null}
                size="lg"
                viewable
              />
              <span className="sh-who">
                {selected.display_name}
                <small>
                  {selected.contact_phone ? (
                    <span>{formatBrPhone(selected.contact_phone)}</span>
                  ) : null}
                  {selected.contact_email ? <span>{selected.contact_email}</span> : null}
                  {!selected.contact_phone && !selected.contact_email
                    ? 'Sem contato informado'
                    : null}
                </small>
              </span>
              {selected.contact_phone ? (
                <a
                  className="cli-whats"
                  aria-label={`Conversar com ${selected.display_name} no WhatsApp`}
                  href={
                    whatsapp(
                      selected.contact_phone,
                      `Oi, ${selected.display_name.split(' ')[0]}! `,
                    ) ?? undefined
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle size={17} aria-hidden /> <span>WhatsApp</span>
                </a>
              ) : null}
            </span>
          ) : (
            ''
          )
        }
      >
        {selected ? (
          <ClientProfile
            key={selected.id}
            api={api}
            client={selected}
            checks={checks}
            history={history}
            detail={sheetDetail}
            requiredLevel={requiredLevel}
            onChanged={(message) => {
              setNotice(message)
              void load()
              void loadDetail(selected.id)
            }}
            photoBusy={photoBusy}
            photoError={photoError}
            saving={saving}
            onBook={() => {
              setSheet(null)
              setBooking(selected.id)
            }}
            onEdit={() => void openEdit(selected)}
            onVoucher={
              canIssueVouchers && selected.status === 'active'
                ? () => setVoucherClient(selected)
                : undefined
            }
            onPhoto={() => photoInput.current?.click()}
            onRemovePhoto={() => void changePhoto(selected.id, null)}
            onStatus={() =>
              void changeStatus(selected.id, selected.status === 'active' ? 'archived' : 'active')
            }
          />
        ) : null}
        <input
          ref={photoInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file && selected) void changePhoto(selected.id, file)
          }}
        />
      </QuickModal>

      <BookingModal
        api={api}
        isOpen={Boolean(booking)}
        onOpenChange={(next) => !next && setBooking(null)}
        initialClientId={booking ?? undefined}
        onCreated={(message) => {
          setNotice(message)
          void load()
        }}
      />

      <Modal.Backdrop isOpen={open} onOpenChange={setOpen} className="qm-back qm-back-glow">
        <Modal.Container size="lg" scroll="inside" className="qm-container">
          <Modal.Dialog className="manager-dialog qm qm-lg qm-glow manager-client-dialog">
            <Modal.CloseTrigger aria-label="Fechar" />
            <Modal.Header className="qm-head">
              <Modal.Heading className="manager-client-title">
                <span className="manager-client-title-icon" aria-hidden="true">
                  <UserRound size={22} />
                </span>
                <span>{editing ? 'Editar cliente' : 'Adicionar cliente'}</span>
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="qm-body lx-scroll manager-client-body">
              {error && (
                <p className="manager-data-error" role="alert">
                  {error}
                </p>
              )}
              {duplicates && (
                <div className="manager-duplicate-box" role="alert">
                  <strong>Já existe cadastro com este telefone</strong>
                  <ul>
                    {duplicates.map((item) => (
                      <li key={item.id}>
                        {item.display_name}
                        {item.status === 'archived' ? ' (arquivada)' : ''}
                      </li>
                    ))}
                  </ul>
                  <p>
                    Pode ser a mesma pessoa. Se for outra (por exemplo, mãe e filha dividindo o
                    número), salve mesmo assim.
                  </p>
                  <div className="manager-toolbar-actions">
                    <Button variant="secondary" onPress={() => setDuplicates(null)}>
                      Revisar
                    </Button>
                    <Button isDisabled={saving} onPress={() => void submit(undefined, true)}>
                      Salvar mesmo assim
                    </Button>
                  </div>
                </div>
              )}
              {intake.on && intake.index >= 0 ? (
                <div className="anm anm-intake">
                  <div
                    className="anm-progress"
                    aria-label={`Anamnese: etapa ${intake.index + 1} de ${intakeSteps.length + 1}`}
                  >
                    <span
                      style={{
                        transform: `scaleX(${(intake.index + 1) / (intakeSteps.length + 1)})`,
                      }}
                    />
                  </div>
                  <p className="anm-kicker">
                    {levelNames[requiredLevel]} · {form.name.trim()}
                  </p>
                  {intakeStep ? (
                    <AnamnesisStep
                      step={intakeStep}
                      answers={intake.answers}
                      onChange={(answers) => setIntake({ ...intake, answers })}
                    />
                  ) : (
                    <div className="anm-step">
                      <h3>Tudo certo!</h3>
                      <p>Confirme com a cliente antes de salvar.</p>
                      <CheckboxField
                        isSelected={intake.consent}
                        onChange={(consent) => setIntake({ ...intake, consent })}
                        label="A cliente confirmou as respostas"
                        description="E autorizou o registro para cuidar do atendimento."
                      />
                    </div>
                  )}
                </div>
              ) : null}
              {loadingDetail ? (
                <p className="ws-loading" role="status">
                  Carregando a ficha…
                </p>
              ) : !(intake.on && intake.index >= 0) ? (
                <ClientCreateSteps
                  editing={Boolean(editing)}
                  step={createStep}
                  form={form}
                  setForm={(next) => {
                    if (next.phone !== form.phone) setDuplicates(null)
                    if (next.taxId !== form.taxId || next.email !== form.email) setFieldErrors({})
                    setForm(next)
                  }}
                  taxIdError={fieldErrors.taxId}
                  emailError={fieldErrors.email}
                  anamnesisLabel={levelNames[requiredLevel]}
                  anamnesisSteps={staffSteps(requiredLevel, intake.answers).length}
                  onGoTo={setCreateStep}
                  onStartAnamnesis={() => {
                    setIntake((current) => ({ ...current, on: true }))
                    startIntake()
                  }}
                  onSkipAnamnesis={() => {
                    setIntake((current) => ({ ...current, on: false, index: -1 }))
                    setCreateStep('review')
                  }}
                  formatPhone={formatBrPhone}
                  formatTaxId={formatCpf}
                />
              ) : null}
            </Modal.Body>
            <Modal.Footer className="qm-foot">
              {intake.on && intake.index >= 0 ? (
                <>
                  <Button
                    variant="secondary"
                    onPress={() => setIntake({ ...intake, index: intake.index - 1 })}
                  >
                    Voltar
                  </Button>
                  {intakeAtEnd ? (
                    <Button isDisabled={saving || !intake.consent} onPress={() => void submit()}>
                      <ShieldCheck size={16} aria-hidden />{' '}
                      {saving ? 'Salvando…' : 'Salvar cliente e anamnese'}
                    </Button>
                  ) : (
                    <Button
                      isDisabled={!intakeStep || !staffStepComplete(intakeStep, intake.answers)}
                      onPress={() => setIntake({ ...intake, index: intake.index + 1 })}
                    >
                      Continuar
                    </Button>
                  )}
                </>
              ) : (
                <>
                  {editing ? (
                    <Button
                      variant="ghost"
                      className="cli-archive qm-foot-start"
                      aria-label={
                        editing.status === 'active' ? 'Arquivar cliente' : 'Reativar cliente'
                      }
                      isDisabled={saving}
                      onPress={() =>
                        void changeStatus(
                          editing.id,
                          editing.status === 'active' ? 'archived' : 'active',
                        )
                      }
                    >
                      {editing.status === 'active' ? (
                        <Archive size={17} aria-hidden />
                      ) : (
                        <ArchiveRestore size={17} aria-hidden />
                      )}
                      <span>{editing.status === 'active' ? 'Arquivar' : 'Reativar'}</span>
                    </Button>
                  ) : null}
                  {createStep === 'who' ? (
                    <Button variant="secondary" onPress={() => setOpen(false)}>
                      Cancelar
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onPress={() => {
                        const index = steps.findIndex((item) => item.id === createStep)
                        setCreateStep(steps[Math.max(0, index - 1)].id)
                      }}
                    >
                      Voltar
                    </Button>
                  )}
                  {createStep !== 'review' && canSave ? (
                    <Button
                      variant="secondary"
                      isDisabled={saving || loadingDetail}
                      onPress={() => void submit()}
                    >
                      {saving ? 'Salvando…' : editing ? 'Salvar' : 'Salvar agora'}
                    </Button>
                  ) : null}
                  {createStep === 'review' ? (
                    <Button isDisabled={saving || loadingDetail} onPress={() => void submit()}>
                      <Check size={16} aria-hidden />{' '}
                      {saving
                        ? 'Salvando…'
                        : editing
                          ? 'Salvar alterações'
                          : intake.on
                            ? 'Salvar cliente e anamnese'
                            : 'Salvar cliente'}
                    </Button>
                  ) : createStep !== 'anamnesis' ? (
                    <Button
                      isDisabled={!canSave || loadingDetail}
                      onPress={() => {
                        const index = steps.findIndex((item) => item.id === createStep)
                        setCreateStep(steps[index + 1].id)
                      }}
                    >
                      {createStep === 'who' ? 'Continuar' : 'Próximo'}
                    </Button>
                  ) : null}
                </>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
      {voucherClient !== undefined ? (
        <VoucherModal
          api={api}
          initialClient={voucherClient}
          onClose={() => setVoucherClient(undefined)}
        />
      ) : null}
    </div>
  )
}

function ClientTags({
  client,
  checks,
}: {
  client: Client
  checks: ReturnType<typeof clientChecks>
}) {
  const tags = [
    client.status === 'archived' && { key: 'archived', label: 'Arquivada', tone: '' },
    checks.birthday(client) && { key: 'birthday', label: 'Aniversário no mês', tone: 'accent' },
    client.next_visit_at && { key: 'next', label: 'Horário marcado', tone: 'good' },
    checks.away(client) && { key: 'away', label: 'Sumida', tone: 'warn' },
    client.notes && { key: 'notes', label: 'Tem observações', tone: 'warn' },
    client.linked && { key: 'linked', label: 'Conta Luminix', tone: '' },
  ].filter(Boolean) as { key: string; label: string; tone: string }[]
  if (!tags.length) return null
  return (
    <span className="cli-tags">
      {tags.map((tag) => (
        <span key={tag.key} className={`cli-tag${tag.tone ? ` is-${tag.tone}` : ''}`}>
          {tag.label}
        </span>
      ))}
    </span>
  )
}

const methodLabels: Record<string, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  credit: 'Crédito',
  debit: 'Débito',
  transfer: 'Transferência',
  other: 'Outro',
}

function ageOf(birth: string) {
  const [year, month, day] = birth.slice(0, 10).split('-').map(Number)
  const now = new Date()
  const had = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day)
  return now.getFullYear() - year - (had ? 0 : 1)
}

/** One visit of the timeline: date badge, service, status and how it was paid. */
function Visit({ item }: { item: HistoryItem }) {
  const date = new Date(item.starts_at)
  const price = item.price_cents
  const paid = item.paid_cents ?? 0
  const pay =
    item.status === 'canceled' || item.status === 'no_show'
      ? null
      : item.paid
        ? {
            tone: 'on',
            text: `Pago${item.paid_method ? ` · ${methodLabels[item.paid_method] ?? ''}` : ''}`,
          }
        : price === 0 && item.price_type !== 'quote'
          ? { tone: 'off', text: 'Sem cobrança' }
          : paid > 0 && price != null
            ? { tone: 'part', text: `Parcial · faltam ${money(price - paid)}` }
            : item.status === 'completed'
              ? { tone: 'pending', text: 'A receber' }
              : null
  return (
    <li className="cli-visit">
      <span className="cli-date" aria-hidden>
        <strong>{date.toLocaleDateString('pt-BR', { day: '2-digit' })}</strong>
        <small>{date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small>
      </span>
      <div className="cli-visit-copy">
        <span>{item.service_name}</span>
        <small>
          {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          {item.professional_name ? ` · ${item.professional_name}` : ''}
          {item.status === 'canceled' && item.status_note ? ` · ${item.status_note}` : ''}
        </small>
        {item.previous_starts_at ? (
          <small>
            Remarcado · antes em{' '}
            {new Date(item.previous_starts_at).toLocaleString('pt-BR', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </small>
        ) : null}
        {item.package_name ? (
          <small>
            {item.package_name}
            {item.package_session && item.package_sessions && item.status !== 'canceled'
              ? ` · Sessão ${item.package_session} de ${item.package_sessions}`
              : ''}
          </small>
        ) : null}
        <span className="cli-visit-tags">
          <span className={`sh-mini is-${item.status}`}>
            {statusLabels[item.status] ?? item.status}
          </span>
          {pay ? <span className={`sh-mini is-pay-${pay.tone}`}>{pay.text}</span> : null}
          {item.receipt_url ? (
            <a
              className="sh-mini is-receipt"
              href={item.receipt_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Comprovante
            </a>
          ) : null}
        </span>
      </div>
      {price != null ? <b>{money(price)}</b> : null}
    </li>
  )
}

type ProfileTab = 'cover' | 'data' | 'history'
type ClientPackage = {
  id: string
  serviceId: string
  /** Per service; a combo has more than one. */
  items?: { serviceId: string; sessions: number; used: number; left: number }[]
  kind?: 'sessions' | 'combo'
  durationMinutes?: number | null
  name: string
  sessionsTotal: number
  used: number
  done: number
  left: number
  priceCents: number | null
  soldOn: string
  expiresOn: string | null
  status: 'active' | 'finished' | 'expired' | 'canceled'
}
const packageStatus: Record<ClientPackage['status'], string> = {
  active: 'Em uso',
  finished: 'Concluído',
  expired: 'Vencido',
  canceled: 'Cancelado',
}

/**
 * The client as a profile, in tabs: the cover (numbers, next visit, care and actions), personal
 * data with anamnese, and the history of visits and packages.
 */
function ClientProfile({
  api,
  client,
  checks,
  history,
  detail,
  requiredLevel,
  photoBusy,
  photoError,
  saving,
  onBook,
  onEdit,
  onVoucher,
  onPhoto,
  onRemovePhoto,
  onStatus,
  onChanged,
}: {
  api: ClinicApi
  client: Client
  checks: ReturnType<typeof clientChecks>
  history: HistoryItem[] | null
  /** Health record (null while loading or when there is none). */
  detail: { record: StaffAnamnesis | null; shared: boolean } | null
  requiredLevel: Level
  photoBusy: boolean
  photoError: string
  saving: boolean
  onBook: () => void
  onEdit: () => void
  onVoucher?: () => void
  onPhoto: () => void
  onRemovePhoto: () => void
  onStatus: () => void
  onChanged: (message: string) => void
}) {
  const [tab, setTab] = useState<ProfileTab>('cover')
  const [visits, setVisits] = useState<'next' | 'past'>('past')
  const [showAnamnesis, setShowAnamnesis] = useState(false)
  // Opening time of the sheet: what is still ahead and what already happened.
  const [now] = useState(() => Date.now())
  const [packages, setPackages] = useState<ClientPackage[] | null>(null)
  const [reloadPackages, setReloadPackages] = useState(0)
  const upcoming = (history ?? [])
    .filter(
      (item) =>
        new Date(item.starts_at).getTime() >= now &&
        ['scheduled', 'confirmed'].includes(item.status),
    )
    .reverse()
  const past = (history ?? []).filter((item) => !upcoming.includes(item))
  const shown = visits === 'next' ? upcoming : past
  const birth = client.birth_date?.slice(0, 10)
  const activePackages = (packages ?? []).filter((item) => item.status === 'active')

  useEffect(() => {
    let active = true
    void api
      .get<{ packages: ClientPackage[] }>(`clients/${client.id}/packages`)
      .then((body) => active && setPackages(body.packages))
      .catch(() => active && setPackages([]))
    return () => {
      active = false
    }
  }, [api, client.id, reloadPackages])

  const tabs: { id: ProfileTab; label: string; icon: ReactNode; count?: number }[] = [
    { id: 'cover', label: 'Resumo', icon: <FileText size={15} aria-hidden /> },
    { id: 'data', label: 'Dados', icon: <IdCard size={15} aria-hidden /> },
    {
      id: 'history',
      label: 'Histórico',
      icon: <History size={15} aria-hidden />,
      count: history?.length || undefined,
    },
  ]

  return (
    <div className="apt-sheet-body sh-body cpf">
      <div className="cpf-tabs lx-scroll" role="tablist" aria-label="Partes da ficha">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.icon} {item.label}
            {item.count ? <em>{item.count}</em> : null}
          </button>
        ))}
      </div>

      {tab === 'cover' ? (
        <>
          <span className="cpf-badges">
            <ClientTags client={client} checks={checks} />
            <AnamnesisBadge summary={client.anamnesis ?? null} required={requiredLevel} />
          </span>
          <dl className="cli-strip">
            <div>
              <dt>Atendimentos</dt>
              <dd>{client.completed_count}</dd>
            </div>
            {client.spent_cents != null ? (
              <div>
                <dt>Total gasto</dt>
                <dd>{money(client.spent_cents)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Última visita</dt>
              <dd>{client.last_visit_at ? shortDate(client.last_visit_at) : '—'}</dd>
            </div>
            <div>
              <dt>Cliente desde</dt>
              <dd>{shortDate(client.created_at)}</dd>
            </div>
          </dl>

          <div className={`sh-summary cli-next${client.next_visit_at ? '' : ' is-empty'}`}>
            <span className="sh-summary-icon" aria-hidden>
              <CalendarClock size={22} />
            </span>
            <span className="cli-next-copy">
              <small>Próximo horário</small>
              <strong>
                {client.next_visit_at
                  ? new Intl.DateTimeFormat('pt-BR', {
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(client.next_visit_at))
                  : 'Nenhum marcado'}
              </strong>
            </span>
            {client.status === 'active' ? (
              <Button
                size="sm"
                variant={client.next_visit_at ? 'secondary' : 'primary'}
                onPress={onBook}
              >
                <CalendarPlus size={16} aria-hidden /> Agendar
              </Button>
            ) : null}
          </div>

          {activePackages.length ? (
            <button type="button" className="cpf-pack-strip" onClick={() => setTab('history')}>
              <Package size={18} aria-hidden />
              {activePackages.map((item) => (
                <span key={item.id}>
                  <strong>{item.name}</strong> · {item.left === 1 ? 'resta' : 'restam'} {item.left}{' '}
                  de {item.sessionsTotal}
                </span>
              ))}
            </button>
          ) : null}

          {client.notes ? (
            <p className="sh-attention">
              <NotebookPen size={16} aria-hidden />
              <span className="cli-notes">{client.notes}</span>
            </p>
          ) : (
            <button type="button" className="cli-add-note" onClick={() => setTab('data')}>
              <NotebookPen size={16} aria-hidden /> Sem cuidados anotados. Registrar alergias,
              gestação ou medicamentos
            </button>
          )}

          <section className="sh-actions" aria-labelledby="cli-actions-title">
            <h3 id="cli-actions-title">Ações</h3>
            <div className="cpf-actions">
              <button type="button" onClick={onBook} disabled={client.status !== 'active'}>
                <CalendarPlus size={20} aria-hidden /> Agendar
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('data')
                  setShowAnamnesis(true)
                  requestAnimationFrame(() => document.getElementById('clinic-intake')?.focus())
                }}
              >
                <ClipboardCheck size={20} aria-hidden /> Anamnese
              </button>
              {onVoucher ? (
                <button type="button" className="cli-voucher" onClick={onVoucher}>
                  <Gift size={20} aria-hidden /> Voucher
                </button>
              ) : null}
            </div>
            <div className="cli-quiet-actions">
              <button type="button" className="team-link" disabled={saving} onClick={onStatus}>
                {client.status === 'active' ? 'Arquivar cliente' : 'Reativar cliente'}
              </button>
            </div>
          </section>
        </>
      ) : null}

      {tab === 'data' ? (
        <section className="sh-actions cpf-data">
          <h3>
            <IdCard size={19} aria-hidden /> Dados pessoais
          </h3>
          <dl className="apt-client">
            <div>
              <dt>
                <Phone size={15} aria-hidden /> WhatsApp
              </dt>
              <dd>
                {client.contact_phone ? formatBrPhone(client.contact_phone) : 'Não informado'}
              </dd>
            </div>
            <div>
              <dt>
                <Mail size={15} aria-hidden /> E-mail
              </dt>
              <dd>{client.contact_email ?? 'Não informado'}</dd>
            </div>
            <div>
              <dt>
                <Cake size={15} aria-hidden /> Nascimento
              </dt>
              <dd>
                {birth
                  ? `${birth.split('-').reverse().join('/')} · ${ageOf(birth)} anos`
                  : 'Não informado'}
              </dd>
            </div>
            <div>
              <dt>
                <UserRound size={15} aria-hidden /> Sexo biológico
              </dt>
              <dd>
                {client.sex === 'female'
                  ? 'Feminino'
                  : client.sex === 'male'
                    ? 'Masculino'
                    : 'Não informado'}
              </dd>
            </div>
            <div>
              <dt>
                <IdCard size={15} aria-hidden /> CPF
              </dt>
              <dd>{client.tax_id_masked ?? 'Não informado'}</dd>
            </div>
            <div>
              <dt>
                <MessageCircle size={15} aria-hidden /> Mensagens
              </dt>
              <dd>{client.marketing_opt_in ? 'Aceita receber' : 'Não autorizou'}</dd>
            </div>
            <div>
              <dt>
                <ShieldCheck size={15} aria-hidden /> Conta Luminix
              </dt>
              <dd>{client.linked ? 'Conectada' : 'Não tem'}</dd>
            </div>
            <div>
              <dt>
                <NotebookPen size={15} aria-hidden /> Cuidados
              </dt>
              <dd>{client.notes || 'Nada anotado'}</dd>
            </div>
          </dl>
          <div className="sh-row">
            <Button variant="secondary" onPress={onEdit}>
              <Pencil size={17} aria-hidden /> Editar dados
            </Button>
            <Button
              variant="ghost"
              onPress={() => setShowAnamnesis((visible) => !visible)}
              aria-expanded={showAnamnesis}
            >
              <ClipboardCheck size={17} aria-hidden />{' '}
              {showAnamnesis ? 'Ocultar anamnese' : 'Ver anamnese'}
            </Button>
          </div>
          <div className="cli-quiet-actions">
            {!client.photo_url && !client.account_photo ? (
              <button type="button" className="team-link" disabled={photoBusy} onClick={onPhoto}>
                {photoBusy ? 'Enviando…' : 'Adicionar foto'}
              </button>
            ) : null}
            {client.photo_url ? (
              <button
                type="button"
                className="team-link"
                disabled={photoBusy}
                onClick={onRemovePhoto}
              >
                Remover foto
              </button>
            ) : null}
          </div>
          {photoError ? (
            <p className="apt-error" role="alert">
              {photoError}
            </p>
          ) : null}
          {showAnamnesis ? (
            <div id="clinic-intake" tabIndex={-1}>
              <h3>
                <ClipboardCheck size={19} aria-hidden /> Anamnese da clínica
              </h3>
              <AnamnesisTab
                api={api}
                client={client}
                detail={detail}
                requiredLevel={requiredLevel}
                onSaved={onChanged}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'history' ? (
        <section className="sh-actions" aria-labelledby="cli-history-title">
          <div className="cli-history-head">
            <h3 id="cli-history-title">Atendimentos</h3>
            <div className="biz-chips" role="group" aria-label="Quais atendimentos">
              <button
                type="button"
                aria-pressed={visits === 'past'}
                onClick={() => setVisits('past')}
              >
                <History size={14} aria-hidden /> Anteriores ({past.length})
              </button>
              <button
                type="button"
                aria-pressed={visits === 'next'}
                onClick={() => setVisits('next')}
              >
                <CalendarClock size={14} aria-hidden /> Próximos ({upcoming.length})
              </button>
            </div>
          </div>
          {history === null ? (
            <p className="apt-hint">Carregando…</p>
          ) : shown.length ? (
            <ul className="cli-timeline">
              {shown.slice(0, 30).map((item) => (
                <Visit key={item.id} item={item} />
              ))}
            </ul>
          ) : (
            <p className="apt-hint">
              {visits === 'next' ? 'Nenhum horário marcado.' : 'Nenhum atendimento ainda.'}
            </p>
          )}
          <h3>Pacotes e sessões</h3>
          <PackagesTab
            api={api}
            packages={packages}
            onChanged={(message) => {
              setReloadPackages((value) => value + 1)
              onChanged(message)
            }}
          />
        </section>
      ) : null}
    </div>
  )
}

/** Status of the record and, from here, the same script the client answers in the app. */
function AnamnesisTab({
  api,
  client,
  detail,
  requiredLevel,
  onSaved,
}: {
  api: ClinicApi
  client: Client
  detail: { record: StaffAnamnesis | null; shared: boolean } | null
  requiredLevel: Level
  onSaved: (message: string) => void
}) {
  const record = detail?.record ?? null
  const [filling, setFilling] = useState<{
    index: number
    answers: Answers
    consent: boolean
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  if (!detail) return <p className="apt-hint">Carregando a ficha…</p>
  const level = Math.max(requiredLevel, record?.level ?? 1) as Level
  const state = anamnesisState(client.anamnesis ?? null, requiredLevel)

  if (filling) {
    const list = staffSteps(level, filling.answers)
    const step = list[filling.index]
    const atEnd = filling.index >= list.length
    async function save() {
      setSaving(true)
      setError('')
      try {
        await api.put(`clients/${client.id}/anamnesis`, {
          level,
          answers: filling!.answers,
          consent: true,
        })
        setFilling(null)
        onSaved(`Anamnese de ${client.display_name.split(' ')[0]} salva.`)
      } catch {
        setError('Não foi possível salvar. Confira as respostas e tente de novo.')
      } finally {
        setSaving(false)
      }
    }
    return (
      <section className="anm">
        <div
          className="anm-progress"
          aria-label={`Etapa ${filling.index + 1} de ${list.length + 1}`}
        >
          <span style={{ transform: `scaleX(${(filling.index + 1) / (list.length + 1)})` }} />
        </div>
        {step ? (
          <AnamnesisStep
            step={step}
            answers={filling.answers}
            onChange={(answers) => setFilling({ ...filling, answers })}
          />
        ) : null}
        {atEnd ? (
          <CheckboxField
            isSelected={filling.consent}
            onChange={(consent) => setFilling({ ...filling, consent })}
            label="A cliente confirmou as respostas"
            description="E autorizou o registro para cuidar do atendimento. Fica marcado que a equipe preencheu."
          />
        ) : null}
        {error ? (
          <p className="apt-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="anm-nav">
          <Button
            variant="ghost"
            onPress={() =>
              filling.index === 0
                ? setFilling(null)
                : setFilling({ ...filling, index: filling.index - 1 })
            }
          >
            {filling.index === 0 ? 'Cancelar' : 'Voltar'}
          </Button>
          {atEnd ? (
            <Button isDisabled={!filling.consent || saving} onPress={() => void save()}>
              <ShieldCheck size={16} aria-hidden /> {saving ? 'Salvando…' : 'Salvar anamnese'}
            </Button>
          ) : (
            <Button
              isDisabled={!step || !staffStepComplete(step, filling.answers)}
              onPress={() => setFilling({ ...filling, index: filling.index + 1 })}
            >
              Continuar
            </Button>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="anm">
      <div className={`anm-status is-${state}`}>
        {state === 'ok' ? (
          <ShieldCheck size={22} aria-hidden />
        ) : (
          <ClipboardCheck size={22} aria-hidden />
        )}
        <div>
          <strong>
            {state === 'ok'
              ? 'Anamnese preenchida'
              : state === 'expired'
                ? 'Anamnese vencida'
                : state === 'incomplete'
                  ? 'Anamnese incompleta'
                  : 'Sem anamnese'}
          </strong>
          <small>
            {record && client.anamnesis
              ? `${levelNames[record.level]} · ${dateBr(record.answeredAt)} · ${
                  client.anamnesis.by === 'staff'
                    ? 'preenchida pela equipe'
                    : 'preenchida pela cliente'
                }`
              : `Este espaço pede a ${levelNames[requiredLevel].toLowerCase()}.`}
          </small>
        </div>
        <Button
          size="sm"
          variant={state === 'ok' ? 'secondary' : 'primary'}
          onPress={() =>
            setFilling({
              index: 0,
              consent: false,
              answers: {
                ...(record?.answers ?? {}),
                ...(client.sex && !record ? { sex: client.sex } : {}),
                ...(client.birth_date && !record
                  ? { birthDate: client.birth_date.slice(0, 10) }
                  : {}),
              },
            })
          }
        >
          {record ? 'Editar ficha da clínica' : 'Preencher ficha'}
        </Button>
      </div>
      {detail.shared ? (
        <p className="apt-hint">
          A cliente compartilha a própria ficha. As alterações da equipe ficam salvas somente nesta
          clínica.
        </p>
      ) : null}
      {record ? <AnamnesisView record={record} /> : null}
    </section>
  )
}

/** Packages shown alongside the appointment history. */
function PackagesTab({
  api,
  packages,
  onChanged,
}: {
  api: ClinicApi
  packages: ClientPackage[] | null
  onChanged: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [serviceNames, setServiceNames] = useState<Record<string, string>>({})

  useEffect(() => {
    let active = true
    // Names of the services in combos ("2 de 3 limpezas").
    void api
      .get<{ services: { id: string; name: string }[] }>('catalog')
      .then(
        (body) =>
          active &&
          setServiceNames(Object.fromEntries(body.services.map((item) => [item.id, item.name]))),
      )
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [api])

  async function cancel(item: ClientPackage) {
    setBusy(true)
    setError('')
    try {
      await api.post(`client-packages/${item.id}/cancel`, {})
      onChanged(`${item.name} cancelado. As sessões já usadas continuam no histórico.`)
    } catch {
      setError('Não foi possível cancelar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="cpf-packs">
      {packages === null ? (
        <p className="apt-hint">Carregando…</p>
      ) : packages.length ? (
        <ul>
          {packages.map((item) => (
            <li key={item.id} className={`cpf-pack is-${item.status}`}>
              <div className="cpf-pack-head">
                <strong>{item.name}</strong>
                <span className={`sh-mini is-pack-${item.status}`}>
                  {packageStatus[item.status]}
                </span>
              </div>
              <PackageProgress
                api={api}
                item={item as ClientPackageView}
                canCharge={item.status === 'active' && item.priceCents != null}
                onChanged={() => onChanged(`Pagamento registrado em ${item.name}.`)}
                compact
              />
              {item.kind === 'combo' && item.items?.length ? (
                <p className="cpf-pack-combo">
                  🎁 Cada sessão:{' '}
                  {item.items.map((line) => serviceNames[line.serviceId] ?? 'serviço').join(' + ')}
                  {item.durationMinutes ? ` · ${item.durationMinutes} min` : ''}
                </p>
              ) : item.items && item.items.length > 1 ? (
                <ul className="cpf-pack-items">
                  {item.items.map((line) => (
                    <li key={line.serviceId} data-empty={line.left === 0 || undefined}>
                      <span>{serviceNames[line.serviceId] ?? 'Serviço'}</span>
                      <small>
                        {line.left
                          ? `${line.left === 1 ? 'resta' : 'restam'} ${line.left} de ${line.sessions}`
                          : 'usado'}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : null}
              <small>
                {item.left === 1 ? 'Resta' : 'Restam'} {item.left} de {item.sessionsTotal}{' '}
                {item.sessionsTotal === 1 ? 'sessão' : 'sessões'} · vendido em {dateBr(item.soldOn)}
                {item.expiresOn ? ` · vale até ${dateBr(item.expiresOn)}` : ''}
                {item.priceCents != null ? ` · ${money(item.priceCents)}` : ''}
              </small>
              {item.status === 'active' ? (
                <button
                  type="button"
                  className="team-link"
                  disabled={busy}
                  onClick={() => void cancel(item)}
                >
                  Cancelar pacote
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="apt-hint">Nenhum pacote ainda.</p>
      )}

      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
