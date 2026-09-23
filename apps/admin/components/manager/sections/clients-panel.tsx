'use client'

import { Button, Card, Chip, Modal, Spinner } from '@heroui/react'
import { Plus, Search, UserRound } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useClinic } from '@/components/clinic-workspace'
import { useStaff } from '@/components/staff-provider'
import { formatBrPhone } from '@/lib/phone'

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

export function ClientsPanel({ createSignal = 0 }: { createSignal?: number }) {
  const { clinic } = useClinic()
  const { user } = useStaff()
  const [clients, setClients] = useState<Client[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [mountedAt] = useState(() => Date.now())

  async function load(signal?: AbortSignal) {
    if (!user) return
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
      setLoading(false)
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
        body: JSON.stringify(form),
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
        <label className="manager-inline-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Buscar clientes</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome, telefone ou e-mail"
          />
        </label>
        <Button onPress={() => setOpen(true)}>
          <Plus size={18} /> Adicionar cliente
        </Button>
      </div>
      {error && (
        <p className="manager-data-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <div className="manager-section-status" role="status">
          <Spinner aria-label="Carregando clientes" /> Carregando clientes…
        </div>
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
                <label className="manager-field manager-field-wide">
                  <span>Nome *</span>
                  <input
                    required
                    maxLength={160}
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    autoFocus
                  />
                </label>
                <label className="manager-field">
                  <span>WhatsApp em formato internacional</span>
                  <input
                    maxLength={16}
                    pattern="^\+[1-9][0-9]{7,14}$"
                    placeholder="+5511999999999"
                    value={form.phone}
                    onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  />
                </label>
                <label className="manager-field">
                  <span>E-mail</span>
                  <input
                    type="email"
                    maxLength={254}
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                  />
                </label>
                <label className="manager-field">
                  <span>Nascimento</span>
                  <input
                    type="date"
                    value={form.birthDate}
                    onChange={(event) => setForm({ ...form, birthDate: event.target.value })}
                  />
                </label>
                <label className="manager-field manager-field-wide">
                  <span>Observações internas</span>
                  <textarea
                    rows={3}
                    maxLength={4000}
                    value={form.notes}
                    onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  />
                </label>
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
    </div>
  )
}
