'use client'

import { Button, Card, Chip, Modal } from '@heroui/react'
import {
  CalendarClock,
  IdCard,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  TicketPercent,
  UserRound,
} from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useClinic } from '@/components/clinic-workspace'
import { useStaff } from '@/components/staff-provider'
import { formatBrPhone, toE164Phone } from '@/lib/phone'
import { isValidBrazilianTaxId } from '@/lib/tax-id'
import {
  CheckboxField,
  DateInputField,
  SearchInput,
  SelectField,
  TextInputField,
} from '@/components/ui/fields'
import { useSearchFocus, type SearchFocus } from '../workspace/workspace-signals'

// Biological sex (waxing, intimate treatments), not gender identity.
type Sex = 'female' | 'male'
type StatusFilter = 'active' | 'archived' | 'all'

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
  last_visit_at: string | null
}

type ClientDetail = {
  id: string
  display_name: string
  contact_phone: string | null
  contact_email: string | null
  birth_date: string | null
  notes: string | null
  status: 'active' | 'archived'
  tax_id: string | null
  sex: Sex | null
  marketing_opt_in: boolean
}

type HistoryItem = {
  id: string
  starts_at: string
  status: string
  service_name: string
  professional_name: string | null
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

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
}

export function ClientsPanel({
  createSignal = 0,
  focus,
}: {
  createSignal?: number
  focus?: SearchFocus | null
}) {
  const { clinic } = useClinic()
  const { user } = useStaff()
  const [clients, setClients] = useState<Client[]>([])
  const [query, setQuery] = useState('')
  useSearchFocus(focus, setQuery)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [voucherOpen, setVoucherOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<{ id: string; status: 'active' | 'archived' } | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [duplicates, setDuplicates] = useState<Duplicate[] | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ taxId?: string; email?: string }>({})
  const [saving, setSaving] = useState(false)
  const [mountedAt] = useState(() => Date.now())

  async function authHeaders() {
    return { authorization: `Bearer ${await user!.getIdToken()}` }
  }

  async function load(signal?: AbortSignal) {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const search = new URLSearchParams({ status: statusFilter })
      if (query.trim()) search.set('q', query.trim())
      const response = await fetch(`/api/clinics/${clinic.id}/clients?${search}`, {
        headers: await authHeaders(),
        cache: 'no-store',
        signal,
      })
      if (!response.ok) throw new Error('Unavailable')
      const body: { clients: Client[] } = await response.json()
      setClients(body.clients)
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError'))
        setError('Não foi possível carregar os clientes desta clínica.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    const abort = new AbortController()
    const timeout = window.setTimeout(() => void load(abort.signal), 220)
    return () => {
      window.clearTimeout(timeout)
      abort.abort()
    }
    // load is intentionally scoped to the latest query/filter/user/clinic values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic.id, user, query, statusFilter])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setHistory([])
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

  async function openEdit(client: Client) {
    if (!user) return
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
    setHistory([])
    setDuplicates(null)
    setFieldErrors({})
    setError('')
    setLoadingDetail(true)
    setOpen(true)
    try {
      const response = await fetch(`/api/clinics/${clinic.id}/clients/${client.id}`, {
        headers: await authHeaders(),
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Unavailable')
      const body: { client: ClientDetail; history: HistoryItem[] } = await response.json()
      // The list only has a masked CPF; the whole number comes from the detail record.
      setForm((current) => ({ ...current, taxId: formatCpf(body.client.tax_id ?? '') }))
      setHistory(body.history)
    } catch {
      setError('Não foi possível carregar a ficha completa. Feche e tente novamente.')
    } finally {
      setLoadingDetail(false)
    }
  }

  async function submit(event?: FormEvent, confirmDuplicatePhone = false) {
    event?.preventDefault()
    if (!user || saving || loadingDetail) return
    setError('')
    setFieldErrors({})
    const taxDigits = form.taxId.replace(/\D/g, '')
    if (taxDigits && !isValidBrazilianTaxId('cpf', taxDigits)) {
      setFieldErrors({ taxId: 'Confira o CPF informado.' })
      return
    }
    setSaving(true)
    try {
      const response = await fetch(
        editing
          ? `/api/clinics/${clinic.id}/clients/${editing.id}`
          : `/api/clinics/${clinic.id}/clients`,
        {
          method: editing ? 'PUT' : 'POST',
          headers: { ...(await authHeaders()), 'content-type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            phone: form.phone ? toE164Phone(form.phone) || form.phone : '',
            email: form.email,
            birthDate: form.birthDate,
            notes: form.notes,
            taxId: taxDigits,
            ...(form.sex ? { sex: form.sex } : {}),
            marketingOptIn: form.marketingOptIn,
            confirmDuplicatePhone,
          }),
        },
      )
      const body = await response.json().catch(() => null)
      if (response.status === 409 && body?.error === 'Client requires confirmation') {
        setDuplicates(body.duplicates as Duplicate[])
        return
      }
      if (response.status === 409 && body?.error === 'Tax id already registered') {
        setFieldErrors({
          taxId: `Este CPF já está cadastrado${body.client?.display_name ? ` para ${body.client.display_name}` : ''}.`,
        })
        return
      }
      if (!response.ok) {
        if (body?.error === 'Invalid email')
          setFieldErrors({ email: 'Confira o e-mail informado.' })
        else if (body?.error === 'Invalid tax id')
          setFieldErrors({ taxId: 'Confira o CPF informado.' })
        else
          setError(
            body?.error === 'Invalid birth date'
              ? 'Confira a data de nascimento.'
              : editing
                ? 'Não foi possível salvar as alterações.'
                : 'Não foi possível cadastrar a cliente.',
          )
        return
      }
      setOpen(false)
      setDuplicates(null)
      await load()
    } catch {
      setError(
        editing
          ? 'Não foi possível salvar as alterações.'
          : 'Não foi possível cadastrar a cliente.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(status: 'active' | 'archived') {
    if (!user || !editing || saving) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/clinics/${clinic.id}/clients/${editing.id}/status`, {
        method: 'PUT',
        headers: { ...(await authHeaders()), 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!response.ok) throw new Error('Unavailable')
      setOpen(false)
      await load()
    } catch {
      setError('Não foi possível alterar a situação desta cliente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="manager-section manager-data-section">
      <div className="manager-stats" aria-label="Resumo de clientes">
        <div>
          <span>{statusFilter === 'archived' ? 'Arquivadas' : 'Ativas'}</span>
          <strong>{clients.length}</strong>
          <small>nesta busca</small>
        </div>
        <div>
          <span>Com atendimentos</span>
          <strong>{clients.filter((client) => client.appointment_count > 0).length}</strong>
          <small>histórico local</small>
        </div>
        <div>
          <span>Novas</span>
          <strong>
            {
              clients.filter(
                (client) => mountedAt - new Date(client.created_at).getTime() < 30 * 86400000,
              ).length
            }
          </strong>
          <small>últimos 30 dias</small>
        </div>
      </div>
      <div className="manager-section-toolbar manager-data-toolbar">
        <SearchInput
          className="manager-inline-search"
          ariaLabel="Buscar clientes"
          placeholder="Nome, telefone, e-mail ou CPF"
          value={query}
          onChange={setQuery}
        />
        <div className="manager-toolbar-actions">
          {(
            [
              ['active', 'Ativas'],
              ['archived', 'Arquivadas'],
              ['all', 'Todas'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={statusFilter === value ? 'primary' : 'secondary'}
              aria-pressed={statusFilter === value}
              onPress={() => setStatusFilter(value)}
            >
              {label}
            </Button>
          ))}
          <Button variant="secondary" onPress={() => setVoucherOpen(true)}>
            <TicketPercent size={18} /> Voucher
          </Button>
          <Button data-manager-spotlight="add-client" onPress={openCreate}>
            <Plus size={18} /> Adicionar cliente
          </Button>
        </div>
      </div>
      {error && !open && (
        <p className="manager-data-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <Card className="manager-panel manager-client-skeleton" role="status">
          <Card.Header className="manager-panel-heading">
            <div className="manager-skeleton manager-skeleton-heading" />
          </Card.Header>
          <Card.Content>
            {Array.from({ length: 5 }, (_, index) => (
              <div className="manager-skeleton-row" aria-hidden="true" key={index}>
                <div className="manager-skeleton manager-skeleton-avatar" />
                <div className="manager-skeleton-lines">
                  <div className="manager-skeleton manager-skeleton-line" />
                  <div className="manager-skeleton manager-skeleton-line is-short" />
                </div>
                <div className="manager-skeleton manager-skeleton-pill" />
              </div>
            ))}
            <span className="manager-loading-copy">Carregando clientes…</span>
          </Card.Content>
        </Card>
      ) : (
        <Card className="manager-panel">
          <Card.Header className="manager-panel-heading">
            <Card.Title>Clientes da clínica</Card.Title>
            <Chip size="sm" variant="soft">
              {clients.length}
            </Chip>
          </Card.Header>
          <Card.Content>
            {clients.length ? (
              <div className="manager-client-list">
                {clients.map((client) => (
                  <article key={client.id} className="manager-client-row">
                    <div className="manager-client-avatar" aria-hidden="true">
                      <UserRound size={20} />
                    </div>
                    <div className="manager-client-main">
                      <strong>{client.display_name}</strong>
                      <span>
                        {[
                          client.contact_phone && formatBrPhone(client.contact_phone),
                          client.contact_email,
                          client.tax_id_masked,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Sem contato informado'}
                      </span>
                      {(client.linked || client.marketing_opt_in) && (
                        <div className="manager-client-tags">
                          {client.linked && (
                            <Chip size="sm" variant="soft">
                              Conta Luminix
                            </Chip>
                          )}
                          {client.marketing_opt_in && (
                            <Chip size="sm" variant="soft">
                              Aceita mensagens
                            </Chip>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="manager-client-meta">
                      <strong>{client.appointment_count}</strong>
                      <span>{client.appointment_count === 1 ? 'atendimento' : 'atendimentos'}</span>
                    </div>
                    <div className="manager-client-meta">
                      <strong>
                        {client.last_visit_at
                          ? new Intl.DateTimeFormat('pt-BR').format(new Date(client.last_visit_at))
                          : '—'}
                      </strong>
                      <span>última visita</span>
                    </div>
                    <div className="manager-client-actions">
                      <Chip size="sm" variant="soft">
                        {client.status === 'active' ? 'Ativa' : 'Arquivada'}
                      </Chip>
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={`Editar ${client.display_name}`}
                        onPress={() => void openEdit(client)}
                      >
                        <Pencil size={16} /> Editar
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="manager-empty-real">
                <UserRound size={28} />
                <strong>
                  {query
                    ? 'Nenhuma cliente encontrada'
                    : statusFilter === 'archived'
                      ? 'Nenhuma cliente arquivada'
                      : 'Sua lista começa aqui'}
                </strong>
                <p>
                  {query
                    ? 'Tente outro nome, telefone, e-mail ou CPF.'
                    : statusFilter === 'archived'
                      ? 'Clientes arquivadas aparecem aqui e podem ser reativadas.'
                      : 'Cadastre a primeira cliente sem criar uma conta no aplicativo para ela.'}
                </p>
                {!query && statusFilter === 'active' && (
                  <Button onPress={openCreate}>Adicionar cliente</Button>
                )}
              </div>
            )}
          </Card.Content>
        </Card>
      )}
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
                    Cadastro exclusivo de {clinic.name}. Não cria nem vincula conta Luminix
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
              </form>
              {editing && !loadingDetail && history.length > 0 && (
                <section className="manager-client-section" aria-labelledby="client-sec-history">
                  <h3 id="client-sec-history" className="manager-client-section-title">
                    <CalendarClock size={18} aria-hidden="true" /> Últimos atendimentos
                  </h3>
                  <ul className="manager-history">
                    {history.slice(0, 8).map((item) => (
                      <li key={item.id}>
                        <span>
                          {new Intl.DateTimeFormat('pt-BR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          }).format(new Date(item.starts_at))}{' '}
                          · {item.service_name}
                          {item.professional_name ? ` · ${item.professional_name}` : ''}
                        </span>
                        <Chip size="sm" variant="soft">
                          {statusLabels[item.status] ?? item.status}
                        </Chip>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </Modal.Body>
            <Modal.Footer>
              {editing && (
                <Button
                  variant="secondary"
                  isDisabled={saving}
                  onPress={() =>
                    void changeStatus(editing.status === 'active' ? 'archived' : 'active')
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
