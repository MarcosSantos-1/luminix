'use client'

import { Button } from '@heroui/react'
import {
  CalendarClock,
  Layers,
  Pause,
  Pencil,
  Play,
  Plus,
  Sparkles,
  TrendingDown,
} from 'lucide-react'
import { useState } from 'react'
import { MoneyField, SelectField, TextInputField } from '@/components/ui/fields'
import { QuickModal } from '../quick-modal'
import { ClinicApiError, type ClinicApi } from '../settings/clinic-api'
import { StatusPill } from '../settings/settings-kit'
import type { Service } from './catalog-model'
import { money, moneyInput, parseMoney } from './format'
import { serviceIcon } from './service-icons'

export type CatalogPackage = {
  id: string
  serviceId: string
  name: string
  sessions: number
  priceCents: number
  validityDays: number | null
  status: 'active' | 'archived'
  sold: number
  activeSold: number
}

const validityOptions = [
  { id: 'none', label: 'Sem validade' },
  { id: '30', label: '30 dias' },
  { id: '60', label: '60 dias' },
  { id: '90', label: '3 meses' },
  { id: '180', label: '6 meses' },
  { id: '365', label: '1 ano' },
]

/** Pacotes: N sessões de um serviço por um preço fechado, vendidos na ficha da cliente. */
export function PackagesTab({
  api,
  services,
  packages,
  canManage,
  onChanged,
}: {
  api: ClinicApi
  services: Service[]
  packages: CatalogPackage[]
  canManage: boolean
  onChanged: (message: string) => void
}) {
  const [editing, setEditing] = useState<CatalogPackage | null>(null)
  const [busy, setBusy] = useState('')
  const active = services.filter(
    (service) => service.status === 'active' && service.priceType !== 'quote',
  )
  const serviceOf = (id: string) => services.find((service) => service.id === id)

  async function setStatus(item: CatalogPackage, status: 'active' | 'archived') {
    setBusy(item.id)
    try {
      await api.post(`catalog/packages/${item.id}/status`, { status })
      onChanged(
        status === 'archived' ? `${item.name} foi pausado.` : `${item.name} voltou a ser vendido.`,
      )
    } catch {
      onChanged('Não foi possível alterar o pacote.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="biz-tab-body">
      <div className="biz-tab-intro">
        <span className="biz-tab-intro-icon" aria-hidden>
          <Layers size={22} />
        </span>
        <div>
          <strong>Pacotes de sessões</strong>
          <p>
            Venda várias sessões de uma vez com desconto. Na ficha da cliente você registra a venda
            e cada agendamento usa uma sessão, sem cobrar de novo.
          </p>
        </div>
        {canManage && active.length ? (
          <Button
            onPress={() =>
              setEditing({
                id: crypto.randomUUID(),
                serviceId: active[0].id,
                name: '',
                sessions: 5,
                priceCents: active[0].priceCents * 5 * 0.85,
                validityDays: 180,
                status: 'active',
                sold: 0,
                activeSold: 0,
              })
            }
          >
            <Plus size={16} aria-hidden /> Novo pacote
          </Button>
        ) : null}
      </div>

      {packages.length ? (
        <ul className="biz-grid biz-packs">
          {packages.map((item) => {
            const service = serviceOf(item.serviceId)
            const Icon = serviceIcon(service?.category ?? '', service?.name ?? '')
            const full = (service?.priceCents ?? 0) * item.sessions
            const saving =
              full > item.priceCents ? Math.round(100 - (item.priceCents * 100) / full) : 0
            return (
              <li
                key={item.id}
                className={`biz-tile biz-pack${item.status === 'archived' ? ' is-muted' : ''}`}
              >
                <div className="biz-tile-head">
                  <span className="biz-tile-icon" aria-hidden>
                    <Icon size={20} />
                  </span>
                  <div className="biz-tile-title">
                    <strong title={item.name}>{item.name}</strong>
                    <span className="biz-row-meta">{service?.name ?? 'Serviço removido'}</span>
                  </div>
                  <div className="biz-price">
                    <strong>{money(item.priceCents)}</strong>
                    <small>{money(Math.round(item.priceCents / item.sessions))} / sessão</small>
                  </div>
                </div>
                <div className="biz-pack-sessions" aria-label={`${item.sessions} sessões`}>
                  {Array.from({ length: Math.min(item.sessions, 12) }, (_, index) => (
                    <i key={index} />
                  ))}
                  {item.sessions > 12 ? <em>+{item.sessions - 12}</em> : null}
                  <span>{item.sessions} sessões</span>
                </div>
                <ul className="biz-tile-facts">
                  {saving ? (
                    <li>
                      <TrendingDown size={13} aria-hidden /> {saving}% mais barato que avulso
                    </li>
                  ) : null}
                  <li>
                    <CalendarClock size={13} aria-hidden />{' '}
                    {item.validityDays ? `Vale ${item.validityDays} dias` : 'Sem validade'}
                  </li>
                  <li>
                    <Sparkles size={13} aria-hidden /> {item.sold}{' '}
                    {item.sold === 1 ? 'vendido' : 'vendidos'}
                    {item.activeSold ? ` · ${item.activeSold} em uso` : ''}
                  </li>
                </ul>
                <div className="biz-tags">
                  {item.status === 'archived' ? <StatusPill tone="off">Pausado</StatusPill> : null}
                </div>
                {canManage ? (
                  <div className="biz-tile-actions">
                    <Button size="sm" variant="secondary" onPress={() => setEditing(item)}>
                      <Pencil size={14} aria-hidden /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant={item.status === 'archived' ? 'primary' : 'ghost'}
                      isDisabled={busy === item.id}
                      onPress={() =>
                        void setStatus(item, item.status === 'active' ? 'archived' : 'active')
                      }
                    >
                      {item.status === 'active' ? (
                        <>
                          <Pause size={14} aria-hidden /> Pausar
                        </>
                      ) : (
                        <>
                          <Play size={14} aria-hidden /> Despausar
                        </>
                      )}
                    </Button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="biz-empty-hero">
          <Layers size={30} aria-hidden />
          <strong>Nenhum pacote ainda</strong>
          <p>
            Exemplo: “Depilação a laser · 10 sessões” com 15% de desconto. A cliente paga uma vez e
            você acompanha o saldo na ficha dela.
          </p>
        </div>
      )}

      {editing ? (
        <PackageEditor
          key={editing.id}
          api={api}
          initial={editing}
          isNew={!packages.some((item) => item.id === editing.id)}
          services={active}
          onClose={(message) => {
            setEditing(null)
            if (message) onChanged(message)
          }}
        />
      ) : null}
    </div>
  )
}

function PackageEditor({
  api,
  initial,
  isNew,
  services,
  onClose,
}: {
  api: ClinicApi
  initial: CatalogPackage
  isNew: boolean
  services: Service[]
  onClose: (message?: string) => void
}) {
  const [item, setItem] = useState(initial)
  const [price, setPrice] = useState(moneyInput(Math.round(initial.priceCents)))
  const [nameTouched, setNameTouched] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const service = services.find((entry) => entry.id === item.serviceId)
  const cents = parseMoney(price)
  const full = (service?.priceCents ?? 0) * item.sessions
  const autoName = service ? `${service.name} · ${item.sessions} sessões` : ''
  const name = nameTouched ? item.name : autoName

  function pickDiscount(percent: number) {
    setPrice(moneyInput(Math.round((full * (100 - percent)) / 100)))
  }

  async function save() {
    if (!service) return setError('Escolha o serviço.')
    if (!name.trim()) return setError('Dê um nome ao pacote.')
    if (!cents || cents <= 0) return setError('Confira o preço do pacote.')
    setSaving(true)
    setError('')
    try {
      await api.put(`catalog/packages/${item.id}`, {
        serviceId: item.serviceId,
        name: name.trim(),
        sessions: item.sessions,
        priceCents: cents,
        validityDays: item.validityDays,
      })
      onClose(isNew ? `${name.trim()} criado. Venda na ficha da cliente.` : 'Pacote atualizado.')
    } catch (caught) {
      setError(
        caught instanceof ClinicApiError && caught.status === 403
          ? 'Seu acesso não permite mudar pacotes.'
          : 'Não foi possível salvar o pacote.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <QuickModal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={isNew ? 'Novo pacote' : `Editar ${initial.name}`}
      subtitle="Mudanças valem para as próximas vendas; quem já comprou mantém o que pagou."
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
            {saving ? 'Salvando…' : isNew ? 'Criar pacote' : 'Salvar'}
          </Button>
        </>
      }
    >
      <SelectField
        label="Serviço"
        value={item.serviceId}
        onChange={(serviceId) => setItem({ ...item, serviceId })}
        options={services.map((entry) => ({
          id: entry.id,
          label: `${entry.name} · ${money(entry.priceCents)}`,
        }))}
      />
      <div className="biz-pack-counter">
        <span>Sessões</span>
        <div className="anm-counter">
          <button
            type="button"
            aria-label="Menos sessões"
            onClick={() => setItem({ ...item, sessions: Math.max(2, item.sessions - 1) })}
          >
            −
          </button>
          <output>{item.sessions}</output>
          <button
            type="button"
            aria-label="Mais sessões"
            onClick={() => setItem({ ...item, sessions: Math.min(100, item.sessions + 1) })}
          >
            +
          </button>
        </div>
      </div>
      <TextInputField
        label="Nome do pacote"
        maxLength={120}
        value={name}
        placeholder={autoName}
        onChange={(text) => {
          setNameTouched(true)
          setItem({ ...item, name: text })
        }}
      />
      <MoneyField label="Preço do pacote" value={price} onChange={setPrice} />
      {full ? (
        <div className="team-choice" role="group" aria-label="Desconto sugerido">
          {[0, 10, 15, 20, 25].map((percent) => (
            <button
              key={percent}
              type="button"
              aria-pressed={cents === Math.round((full * (100 - percent)) / 100)}
              onClick={() => pickDiscount(percent)}
            >
              {percent ? `-${percent}%` : 'Sem desconto'}
            </button>
          ))}
        </div>
      ) : null}
      {full && cents ? (
        <p className="settings-muted">
          Avulso sairia {money(full)}. No pacote, {money(Math.round(cents / item.sessions))} por
          sessão
          {full > cents ? ` (economia de ${money(full - cents)})` : ''}.
        </p>
      ) : null}
      <SelectField
        label="Validade depois da compra"
        value={item.validityDays ? String(item.validityDays) : 'none'}
        onChange={(value) =>
          setItem({ ...item, validityDays: value === 'none' ? null : Number(value) })
        }
        options={validityOptions}
      />
    </QuickModal>
  )
}
