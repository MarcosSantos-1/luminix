'use client'

import { Button, Chip, Modal } from '@heroui/react'
import {
  Cake,
  Camera,
  CalendarClock,
  CalendarPlus,
  Gift,
  IdCard,
  MessageCircle,
  NotebookPen,
  Pencil,
  Phone,
  Plus,
  TicketPercent,
  UserRound,
  UserRoundPlus,
  UserRoundX,
  UsersRound,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { formatBrPhone, toE164Phone } from '@/lib/phone'
import { isValidBrazilianTaxId } from '@/lib/tax-id'
import {
  CheckboxField,
  DateInputField,
  SearchInput,
  SelectField,
  TextAreaField,
  TextInputField,
} from '@/components/ui/fields'
import { Action, ClientAvatar, Fact } from '../appointments/appointment-sheet'
import { BookingModal } from '../appointments/booking-modal'
import { money, whatsapp } from '../business/format'
import { FilterMenu, KpiCards, type FilterValue } from '../data-kit'
import { QuickModal } from '../quick-modal'
import { ClinicApiError, useClinicApi } from '../settings/clinic-api'
import { useSearchFocus, type SearchFocus } from '../workspace/workspace-signals'

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
}

type ClientDetail = { tax_id: string | null }

type HistoryItem = {
  id: string
  starts_at: string
  status: string
  service_name: string
  professional_name: string | null
  price_cents: number | null
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

const sexOptions = [
  { id: 'unset', label: 'Não informado' },
  { id: 'female', label: 'Feminino' },
  { id: 'male', label: 'Masculino' },
]

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
  clinicName,
  createSignal = 0,
  focus,
}: {
  clinicId: string
  clinicName: string
  createSignal?: number
  focus?: SearchFocus | null
}) {
  const api = useClinicApi(clinicId)
  const [clients, setClients] = useState<Client[]>([])
  const [canSeeMoney, setCanSeeMoney] = useState(false)
  const [query, setQuery] = useState('')
  useSearchFocus(focus, setQuery)
  const [filters, setFilters] = useState<FilterValue>(defaultFilters)
  const [sort, setSort] = useState('name')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [open, setOpen] = useState(false)
  const [voucherOpen, setVoucherOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<{ id: string; status: 'active' | 'archived' } | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [duplicates, setDuplicates] = useState<Duplicate[] | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ taxId?: string; email?: string }>({})
  const [saving, setSaving] = useState(false)
  const [mountedAt] = useState(() => Date.now())
  const [sheet, setSheet] = useState<{ id: string; from: DOMRect | null } | null>(null)
  const [history, setHistory] = useState<HistoryItem[] | null>(null)
  const [booking, setBooking] = useState<string | null>(null)
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
      const body = await api.get<{ clients: Client[]; canSeeMoney?: boolean }>('clients', {
        status,
        ...(query.trim() ? { q: query.trim() } : {}),
      })
      if (!active()) return
      setClients(body.clients)
      setCanSeeMoney(body.canSeeMoney === true)
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
    try {
      const body = await api.get<{ history: HistoryItem[] }>(`clients/${client.id}`)
      setHistory(body.history)
    } catch {
      setHistory([])
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
    const taxDigits = form.taxId.replace(/\D/g, '')
    if (taxDigits && !isValidBrazilianTaxId('cpf', taxDigits)) {
      setFieldErrors({ taxId: 'Confira o CPF informado.' })
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
      if (editing) await api.put(`clients/${editing.id}`, payload)
      else await api.post('clients', payload)
      setOpen(false)
      setDuplicates(null)
      setNotice(editing ? 'Cadastro atualizado.' : `${form.name.trim()} cadastrada.`)
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
      else if (body?.error === 'Tax id already registered')
        setFieldErrors({
          taxId: `Este CPF já está cadastrado${body.client?.display_name ? ` para ${body.client.display_name}` : ''}.`,
        })
      else if (body?.error === 'Invalid email')
        setFieldErrors({ email: 'Confira o e-mail informado.' })
      else if (body?.error === 'Invalid tax id')
        setFieldErrors({ taxId: 'Confira o CPF informado.' })
      else
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
            id: 'upcoming',
            label: 'Com horário marcado',
            value: count('upcoming'),
            hint: 'Voltam nos próximos dias',
            icon: <CalendarClock size={22} />,
            tone: 'info',
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
        <SearchInput
          className="data-search"
          ariaLabel="Buscar clientes"
          placeholder="Nome, telefone, e-mail ou CPF"
          value={query}
          onChange={setQuery}
        />
        <SelectField
          className="data-sort"
          ariaLabel="Ordenar clientes"
          value={sort}
          onChange={setSort}
          options={canSeeMoney ? sortOptions : sortOptions.filter(({ id }) => id !== 'spent')}
        />
        <FilterMenu
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
        <Button variant="secondary" onPress={() => setVoucherOpen(true)}>
          <TicketPercent size={18} /> Voucher
        </Button>
        <Button data-manager-spotlight="add-client" onPress={openCreate}>
          <Plus size={18} /> Adicionar cliente
        </Button>
      </div>

      {notice ? (
        <p className="team-notice" role="status">
          {notice}
        </p>
      ) : null}
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
                    <ClientAvatar name={client.display_name} photoUrl={client.photo_url} />
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
        title={
          selected ? (
            <span className="cli-sheet-head">
              <ClientAvatar name={selected.display_name} photoUrl={selected.photo_url} size="lg" />
              <span>
                {selected.display_name}
                <small>
                  {[
                    selected.contact_phone && formatBrPhone(selected.contact_phone),
                    selected.contact_email,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Sem contato informado'}
                </small>
              </span>
            </span>
          ) : (
            ''
          )
        }
      >
        {selected ? (
          <div className="apt-sheet-body">
            <ClientTags client={selected} checks={checks} />
            <div className="apt-facts">
              <Fact label="Atendimentos">{selected.completed_count}</Fact>
              {selected.spent_cents != null ? (
                <Fact label="Total gasto">{money(selected.spent_cents)}</Fact>
              ) : null}
              <Fact label="Última visita">
                {selected.last_visit_at ? shortDate(selected.last_visit_at) : 'Ainda não veio'}
              </Fact>
              <Fact label="Próximo horário" tone={selected.next_visit_at ? 'on' : undefined}>
                {selected.next_visit_at
                  ? new Intl.DateTimeFormat('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(selected.next_visit_at))
                  : 'Nenhum marcado'}
              </Fact>
              <Fact label="Cliente desde">{shortDate(selected.created_at)}</Fact>
              {selected.birth_date ? (
                <Fact label="Nascimento">
                  {selected.birth_date.slice(0, 10).split('-').reverse().join('/')}
                </Fact>
              ) : null}
            </div>

            <section className="apt-attention" aria-label="Cuidados e observações">
              <h3>
                <NotebookPen size={17} aria-hidden /> Cuidados e observações
              </h3>
              {selected.notes ? (
                <p className="cli-notes">{selected.notes}</p>
              ) : (
                <p>
                  Nada anotado. Use “Editar cadastro” para registrar alergias, gestação,
                  medicamentos e outros cuidados.
                </p>
              )}
            </section>

            <input
              ref={photoInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void changePhoto(selected.id, file)
              }}
            />
            {photoError ? (
              <p className="apt-error" role="alert">
                {photoError}
              </p>
            ) : null}
            {selected.photo_url ? (
              <button
                type="button"
                className="team-link"
                disabled={photoBusy}
                onClick={() => void changePhoto(selected.id, null)}
              >
                Remover foto
              </button>
            ) : null}
            <div className="apt-actions">
              {selected.status === 'active' ? (
                <Action
                  icon={CalendarPlus}
                  title="Agendar"
                  hint="Marcar um horário para ela"
                  tone="good"
                  onPress={() => {
                    setSheet(null)
                    setBooking(selected.id)
                  }}
                />
              ) : null}
              {selected.contact_phone ? (
                <Action
                  icon={MessageCircle}
                  title="Mandar mensagem"
                  hint="Abre a conversa no WhatsApp"
                  tone="whats"
                  href={
                    whatsapp(
                      selected.contact_phone,
                      `Oi, ${selected.display_name.split(' ')[0]}! `,
                    ) ?? undefined
                  }
                />
              ) : null}
              <Action
                icon={Camera}
                title={selected.photo_url ? 'Trocar foto' : 'Adicionar foto'}
                hint={photoBusy ? 'Enviando…' : 'Só a sua equipe vê'}
                disabled={photoBusy}
                onPress={() => photoInput.current?.click()}
              />
              <Action
                icon={Gift}
                title="Voucher ou presente"
                hint="Dar um mimo ou vale"
                onPress={() => setVoucherOpen(true)}
              />
              <Action
                icon={Pencil}
                title="Editar cadastro"
                hint="Dados, contato e observações"
                onPress={() => void openEdit(selected)}
              />
              <Action
                icon={selected.status === 'active' ? UserRoundX : UserRound}
                title={selected.status === 'active' ? 'Arquivar' : 'Reativar'}
                hint={
                  selected.status === 'active'
                    ? 'Sai da lista, o histórico fica'
                    : 'Volta para a lista de ativas'
                }
                tone={selected.status === 'active' ? 'danger' : undefined}
                disabled={saving}
                onPress={() =>
                  void changeStatus(
                    selected.id,
                    selected.status === 'active' ? 'archived' : 'active',
                  )
                }
              />
            </div>

            <section aria-labelledby="cli-history-title" className="biz-stack">
              <h3 id="cli-history-title" className="cli-section-title">
                <CalendarClock size={17} aria-hidden /> Histórico
              </h3>
              {history === null ? (
                <p className="apt-hint">Carregando histórico…</p>
              ) : history.length ? (
                <ul className="cli-history">
                  {history.slice(0, 12).map((item) => (
                    <li key={item.id}>
                      <div>
                        <span>{item.service_name}</span>
                        <small>
                          {new Intl.DateTimeFormat('pt-BR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          }).format(new Date(item.starts_at))}
                          {item.professional_name ? ` · ${item.professional_name}` : ''}
                        </small>
                      </div>
                      {item.price_cents != null ? <b>{money(item.price_cents)}</b> : null}
                      <Chip size="sm" variant="soft">
                        {statusLabels[item.status] ?? item.status}
                      </Chip>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="apt-hint">Nenhum atendimento registrado ainda.</p>
              )}
            </section>
          </div>
        ) : null}
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

      <Modal.Backdrop isOpen={open} onOpenChange={setOpen}>
        <Modal.Container size="lg">
          <Modal.Dialog className="manager-dialog manager-client-dialog">
            <Modal.CloseTrigger aria-label="Fechar" />
            <Modal.Header>
              <Modal.Heading className="manager-client-title">
                <span className="manager-client-title-icon" aria-hidden="true">
                  <UserRound size={22} />
                </span>
                <span>
                  {editing ? 'Editar cliente' : 'Adicionar cliente'}
                  <small>
                    Cadastro exclusivo de {clinicName}. Não cria nem vincula conta Luminix
                    automaticamente.
                  </small>
                </span>
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="manager-client-body">
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
              <form id="manager-client-form" className="manager-client-form" onSubmit={submit}>
                <section className="manager-client-section" aria-labelledby="client-sec-person">
                  <h3 id="client-sec-person" className="manager-client-section-title">
                    <IdCard size={18} aria-hidden="true" /> Dados pessoais
                  </h3>
                  <div className="manager-client-section-grid is-three">
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
                      label="CPF"
                      inputMode="numeric"
                      placeholder="000.000.000-00"
                      maxLength={14}
                      value={form.taxId}
                      error={fieldErrors.taxId}
                      isDisabled={loadingDetail}
                      description="Opcional. Evita cadastro repetido."
                      onChange={(taxId) => {
                        // The server error is tied to the old value; leaving it would keep the
                        // field invalid and the browser would silently block the next submit.
                        setFieldErrors((current) => ({ ...current, taxId: undefined }))
                        setForm({ ...form, taxId: formatCpf(taxId) })
                      }}
                    />
                    <SelectField
                      label="Sexo biológico"
                      value={form.sex || 'unset'}
                      options={sexOptions}
                      onChange={(value) =>
                        setForm({ ...form, sex: value === 'unset' ? '' : (value as Sex) })
                      }
                    />
                    <DateInputField
                      label="Nascimento"
                      value={form.birthDate}
                      max={new Date().toLocaleDateString('en-CA')}
                      description="Lembra o aniversário em Marketing."
                      onChange={(birthDate) => setForm({ ...form, birthDate })}
                    />
                  </div>
                </section>
                <section className="manager-client-section" aria-labelledby="client-sec-contact">
                  <h3 id="client-sec-contact" className="manager-client-section-title">
                    <Phone size={18} aria-hidden="true" /> Contato
                  </h3>
                  <div className="manager-client-section-grid">
                    <TextInputField
                      label="WhatsApp"
                      type="tel"
                      inputMode="tel"
                      placeholder="(11) 98765-4321"
                      value={form.phone}
                      description="Com DDD. Outros países: use + e o código do país."
                      onChange={(phone) => {
                        setDuplicates(null)
                        setForm({
                          ...form,
                          phone: phone.startsWith('+') ? phone : formatBrPhone(phone),
                        })
                      }}
                    />
                    <TextInputField
                      label="E-mail"
                      type="email"
                      inputMode="email"
                      maxLength={254}
                      value={form.email}
                      error={fieldErrors.email}
                      onChange={(email) => {
                        setFieldErrors((current) => ({ ...current, email: undefined }))
                        setForm({ ...form, email })
                      }}
                    />
                  </div>
                  <div className="manager-client-consent">
                    <MessageCircle size={20} aria-hidden="true" />
                    <CheckboxField
                      isSelected={form.marketingOptIn}
                      onChange={(marketingOptIn) => setForm({ ...form, marketingOptIn })}
                      label="Aceita receber mensagens do estabelecimento"
                      description="Marque somente se a cliente concordou. A data do aceite fica registrada."
                    />
                  </div>
                </section>
                <section className="manager-client-section" aria-labelledby="client-sec-notes">
                  <h3 id="client-sec-notes" className="manager-client-section-title">
                    <NotebookPen size={18} aria-hidden="true" /> Cuidados e observações
                  </h3>
                  <TextAreaField
                    ariaLabel="Cuidados e observações"
                    rows={4}
                    maxLength={4000}
                    placeholder="Alergias, gestação, medicamentos, pele sensível, preferências…"
                    description="Aparece em destaque na ficha e no atendimento."
                    value={form.notes}
                    onChange={(notes) => setForm({ ...form, notes })}
                  />
                </section>
              </form>
            </Modal.Body>
            <Modal.Footer>
              {editing && (
                <Button
                  variant="secondary"
                  isDisabled={saving}
                  onPress={() =>
                    void changeStatus(
                      editing.id,
                      editing.status === 'active' ? 'archived' : 'active',
                    )
                  }
                >
                  {editing.status === 'active' ? 'Arquivar' : 'Reativar'}
                </Button>
              )}
              <Button variant="secondary" onPress={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" form="manager-client-form" isDisabled={saving || loadingDetail}>
                {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Salvar cliente'}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
      <Modal.Backdrop isOpen={voucherOpen} onOpenChange={setVoucherOpen}>
        <Modal.Container size="md">
          <Modal.Dialog className="manager-dialog">
            <Modal.CloseTrigger aria-label="Fechar" />
            <Modal.Header>
              <Modal.Heading>Vouchers</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="manager-voucher-intro">
                <span aria-hidden="true">
                  <TicketPercent size={24} />
                </span>
                <div>
                  <Chip size="sm" variant="soft">
                    Em preparação
                  </Chip>
                  <p>
                    O acesso já está posicionado na tela de clientes. A emissão será ativada junto
                    das regras de valor, validade, uso e auditoria financeira, para não criar
                    vouchers sem controle.
                  </p>
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button onPress={() => setVoucherOpen(false)}>Entendi</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
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
