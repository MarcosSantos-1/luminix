'use client'

import { Button, Card, Chip, Modal } from '@heroui/react'
import { Plus, TicketPercent, UserRound } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useClinic } from '@/components/clinic-workspace'
import { useStaff } from '@/components/staff-provider'
import { formatBrPhone, toE164Phone } from '@/lib/phone'
import { DateInputField, SearchInput, TextAreaField, TextInputField } from '@/components/ui/fields'
import { useSearchFocus, type SearchFocus } from '../workspace/workspace-signals'

type Client = {
  id: string
  display_name: string
  contact_phone: string | null
  contact_email: string | null
  birth_date: string | null
  notes: string | null
  status: 'active' | 'archived'
  created_at: string
  appointment_count: number
  last_visit_at: string | null
}

const emptyForm = { name: '', phone: '', email: '', birthDate: '', notes: '' }

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [voucherOpen, setVoucherOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [mountedAt] = useState(() => Date.now())

  async function load(signal?: AbortSignal) {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const search = new URLSearchParams()
      if (query.trim()) search.set('q', query.trim())
      const response = await fetch(`/api/clinics/${clinic.id}/clients?${search}`, {
        headers: { authorization: `Bearer ${await user.getIdToken()}` },
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
    // load is intentionally scoped to the latest query/user/clinic values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic.id, user, query])

  useEffect(() => {
    if (!createSignal) return
    const timeout = window.setTimeout(() => setOpen(true), 0)
    return () => window.clearTimeout(timeout)
  }, [createSignal])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!user || saving) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/clinics/${clinic.id}/clients`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await user.getIdToken()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...form,
          phone: form.phone ? toE164Phone(form.phone) || form.phone : '',
        }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(body?.error === 'Invalid email' ? 'Confira o e-mail informado.' : '')
      setForm(emptyForm)
      setOpen(false)
      setLoading(true)
      await load()
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : 'Não foi possível cadastrar a cliente.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="manager-section manager-data-section">
      <div className="manager-stats" aria-label="Resumo de clientes">
        <div>
          <span>Ativas</span>
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
          placeholder="Nome, telefone ou e-mail"
          value={query}
          onChange={setQuery}
        />
        <div className="manager-toolbar-actions">
          <Button variant="secondary" onPress={() => setVoucherOpen(true)}>
            <TicketPercent size={18} /> Voucher
          </Button>
          <Button data-manager-spotlight="add-client" onPress={() => setOpen(true)}>
            <Plus size={18} /> Adicionar cliente
          </Button>
        </div>
      </div>
      {error && (
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
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Sem contato informado'}
                      </span>
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
                    <Chip size="sm" variant="soft">
                      {client.status === 'active' ? 'Ativa' : 'Arquivada'}
                    </Chip>
                  </article>
                ))}
              </div>
            ) : (
              <div className="manager-empty-real">
                <UserRound size={28} />
                <strong>{query ? 'Nenhuma cliente encontrada' : 'Sua lista começa aqui'}</strong>
                <p>
                  {query
                    ? 'Tente outro nome, telefone ou e-mail.'
                    : 'Cadastre a primeira cliente sem criar uma conta no aplicativo para ela.'}
                </p>
                {!query && <Button onPress={() => setOpen(true)}>Adicionar cliente</Button>}
              </div>
            )}
          </Card.Content>
        </Card>
      )}
      <Modal.Backdrop isOpen={open} onOpenChange={setOpen}>
        <Modal.Container size="lg">
          <Modal.Dialog className="manager-dialog">
            <Modal.CloseTrigger aria-label="Fechar" />
            <Modal.Header>
              <Modal.Heading>Adicionar cliente</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="manager-form-intro">
                Este cadastro pertence somente a {clinic.name}. Ele não cria nem vincula uma conta
                global por coincidência de telefone ou e-mail.
              </p>
              <form id="manager-client-form" className="manager-form-grid" onSubmit={submit}>
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
                  type="tel"
                  inputMode="tel"
                  placeholder="(11) 98765-4321"
                  value={form.phone}
                  description="Com DDD. Clientes de outros países: use + e o código do país."
                  onChange={(phone) =>
                    setForm({
                      ...form,
                      phone: phone.startsWith('+') ? phone : formatBrPhone(phone),
                    })
                  }
                />
                <TextInputField
                  label="E-mail"
                  type="email"
                  inputMode="email"
                  maxLength={254}
                  value={form.email}
                  onChange={(email) => setForm({ ...form, email })}
                />
                <DateInputField
                  label="Nascimento"
                  value={form.birthDate}
                  max={new Date().toLocaleDateString('en-CA')}
                  description="Usado para lembrar o aniversário em Marketing."
                  onChange={(birthDate) => setForm({ ...form, birthDate })}
                />
                <TextAreaField
                  className="manager-field-wide"
                  label="Observações internas"
                  rows={3}
                  maxLength={4000}
                  value={form.notes}
                  onChange={(notes) => setForm({ ...form, notes })}
                />
              </form>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onPress={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" form="manager-client-form" isDisabled={saving}>
                {saving ? 'Salvando…' : 'Salvar cliente'}
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
