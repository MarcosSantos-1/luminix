'use client'

import { Button } from '@heroui/react'
import { Clock, Gift, MessageCircle, Search, TicketPercent } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import type { Service } from '../business/catalog-model'
import {
  DateInputField,
  MoneyField,
  SearchInput,
  SelectField,
  TextInputField,
} from '@/components/ui/fields'
import { localDate } from '../appointments/model'
import { dateBr, money, parseMoney, whatsapp } from '../business/format'
import { QuickModal } from '../quick-modal'
import { ClientPicker, type ClientChoice } from './client-picker'
import type { ClinicApi } from '../settings/clinic-api'

export type ClientVoucher = {
  id: string
  discount_type: 'fixed' | 'percent' | 'service'
  discount_value: number
  /** "Serviço grátis": the service it pays for. */
  service_id?: string | null
  service_name?: string | null
  expires_on: string
  status: 'available' | 'expired' | 'used'
}

export function voucherDiscount({ discount_type, discount_value, service_name }: ClientVoucher) {
  if (discount_type === 'service') return `${service_name ?? 'Serviço'} grátis`
  return discount_type === 'percent' ? `${discount_value}%` : money(discount_value)
}

function durationText(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? `${hours}h${rest ? String(rest).padStart(2, '0') : ''}` : `${rest} min`
}

/** Escolher o serviço do voucher: busca, preço e duração; tocar já escolhe. */
function ServicePickerModal({
  services,
  onPick,
  onClose,
}: {
  services: Service[] | null
  onPick: (service: Service) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLocaleLowerCase('pt-BR')
  const list = (services ?? []).filter(
    (item) =>
      item.status === 'active' &&
      (!needle || `${item.name} ${item.category}`.toLocaleLowerCase('pt-BR').includes(needle)),
  )
  return (
    <QuickModal isOpen onOpenChange={(open) => !open && onClose()} title="Qual serviço é grátis?">
      <SearchInput
        className="biz-search"
        ariaLabel="Buscar serviço"
        placeholder="Buscar serviço"
        value={query}
        onChange={setQuery}
      />
      {services === null ? (
        <p className="apt-hint">Carregando serviços…</p>
      ) : (
        <ul className="bk-list bk-services vch-services" aria-label="Serviços">
          {list.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => onPick(item)}>
                <span className="bk-icon">
                  <Gift size={18} aria-hidden />
                </span>
                <strong>{item.name}</strong>
                <span className="bk-service-meta">
                  <small>
                    <Clock size={13} aria-hidden /> {durationText(item.durationMinutes)}
                  </small>
                  <small>
                    {item.priceType === 'quote' ? 'Sob consulta' : money(item.priceCents)}
                  </small>
                </span>
              </button>
            </li>
          ))}
          {!list.length ? (
            <li className="bk-empty">
              <Search size={16} aria-hidden /> Nenhum serviço encontrado.
            </li>
          ) : null}
        </ul>
      )}
    </QuickModal>
  )
}

const voucherStatus = { available: 'Disponível', expired: 'Vencido', used: 'Usado' }

export function VoucherModal({
  api,
  initialClient,
  onClose,
}: {
  api: ClinicApi
  initialClient: ClientChoice | null
  onClose: () => void
}) {
  const [client, setClient] = useState(initialClient)
  const [vouchers, setVouchers] = useState<ClientVoucher[]>([])
  const [type, setType] = useState<ClientVoucher['discount_type']>('percent')
  const [amount, setAmount] = useState('')
  const [service, setService] = useState<Service | null>(null)
  const [picking, setPicking] = useState(false)
  const [services, setServices] = useState<Service[] | null>(null)
  const [showMissing, setShowMissing] = useState(false)
  const [expiresOn, setExpiresOn] = useState('')
  const [submitId, setSubmitId] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [issued, setIssued] = useState<{
    destination: 'app' | 'email' | 'manual'
    text: string
  } | null>(null)
  const path = client ? `clients/${client.id}/vouchers` : ''
  const value = type === 'service' ? 100 : type === 'percent' ? Number(amount) : parseMoney(amount)
  const missingValue =
    type === 'service'
      ? !service
      : !(
          value != null &&
          Number.isInteger(value) &&
          value > 0 &&
          value <= (type === 'percent' ? 100 : 100000000)
        )
  const missingDate = !(expiresOn >= localDate(new Date()))
  const canSubmit = !missingValue && !missingDate

  useEffect(() => {
    if (!picking || services) return
    let active = true
    void api
      .get<{ services: Service[] }>('catalog')
      .then((result) => active && setServices(result.services))
      .catch(() => active && setServices([]))
    return () => {
      active = false
    }
  }, [api, picking, services])

  useEffect(() => {
    if (!path) return
    let active = true
    void api
      .get<{ vouchers: ClientVoucher[] }>(path)
      .then((result) => active && setVouchers(result.vouchers))
      .catch(() => active && setLoadError('Não foi possível carregar os vouchers.'))
    return () => {
      active = false
    }
  }, [api, path])

  function resetNotice() {
    setSubmitId(crypto.randomUUID())
    setError('')
    setIssued(null)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return setShowMissing(true)
    if (!path || busy || value == null || issued) return
    setBusy(true)
    setError('')
    try {
      const result = await api.post<{ id: string; destination: 'app' | 'email' | 'manual' }>(path, {
        id: submitId,
        type,
        value,
        expiresOn,
        ...(type === 'service' && service ? { serviceId: service.id } : {}),
      })
      const voucher: ClientVoucher = {
        id: result.id,
        discount_type: type,
        discount_value: value,
        expires_on: expiresOn,
        status: 'available',
        service_id: service?.id ?? null,
        service_name: service?.name ?? null,
      }
      setVouchers((current) => [voucher, ...current.filter((item) => item.id !== voucher.id)])
      setIssued({
        destination: result.destination,
        text:
          type === 'service'
            ? `Você ganhou ${voucherDiscount(voucher)} até ${dateBr(expiresOn)}. Fale com o espaço para agendar.`
            : `Você recebeu um voucher de ${voucherDiscount(voucher)} de desconto para um atendimento até ${dateBr(expiresOn)}. Fale com o espaço para usar.`,
      })
    } catch {
      setError(
        'Não foi possível emitir. Confira se a cliente está ativa e a validade vai de hoje até dois anos.',
      )
    } finally {
      setBusy(false)
    }
  }

  const share =
    issued?.destination !== 'app' && client?.marketing_opt_in && issued
      ? whatsapp(client.contact_phone, issued.text)
      : null

  return (
    <QuickModal
      isOpen
      onOpenChange={(open) => !open && !busy && onClose()}
      title="Vouchers"
      size="md"
    >
      {client ? (
        <>
          <div className="bk-step">
            <strong>{client.display_name}</strong>
            {!initialClient ? (
              <Button
                variant="ghost"
                size="sm"
                isDisabled={busy}
                onPress={() => {
                  setClient(null)
                  setVouchers([])
                  setLoadError('')
                  resetNotice()
                }}
              >
                Escolher outra cliente
              </Button>
            ) : null}
          </div>
          <form className="bk-step" onSubmit={(event) => void submit(event)}>
            <SelectField
              label="Tipo de voucher"
              value={type}
              isDisabled={busy}
              options={[
                { id: 'percent', label: 'Porcentagem' },
                { id: 'fixed', label: 'Valor em reais' },
                { id: 'service', label: 'Serviço grátis' },
              ]}
              onChange={(next) => {
                setType(next === 'fixed' ? 'fixed' : next === 'service' ? 'service' : 'percent')
                setAmount('')
                resetNotice()
                if (next === 'service' && !service) setPicking(true)
              }}
            />
            {type === 'service' ? (
              <div className="vch-service">
                <span className="lx-field-label">Serviço</span>
                <button
                  type="button"
                  className={`vch-service-pick${showMissing && !service ? ' is-missing' : ''}`}
                  disabled={busy}
                  onClick={() => setPicking(true)}
                >
                  <Gift size={18} aria-hidden />
                  {service ? (
                    <span>
                      <strong>{service.name}</strong>
                      <small>
                        {durationText(service.durationMinutes)} · {money(service.priceCents)}
                      </small>
                    </span>
                  ) : (
                    <span>Escolher serviço</span>
                  )}
                </button>
                {showMissing && !service ? (
                  <p className="lx-missing">Escolha qual serviço o voucher paga.</p>
                ) : null}
              </div>
            ) : type === 'fixed' ? (
              <MoneyField
                label="Valor do desconto"
                value={amount}
                isDisabled={busy}
                error={showMissing && missingValue ? 'Informe o valor do desconto.' : undefined}
                onChange={(next) => {
                  setAmount(next)
                  resetNotice()
                }}
              />
            ) : (
              <TextInputField
                label="Desconto"
                inputMode="numeric"
                maxLength={3}
                placeholder="10"
                suffix="%"
                value={amount}
                isDisabled={busy}
                error={showMissing && missingValue ? 'Informe de 1% a 100%.' : undefined}
                onChange={(next) => {
                  // Mask: only digits, 1 to 100.
                  const digits = next.replace(/\D/g, '').replace(/^0+/, '').slice(0, 3)
                  setAmount(digits && Number(digits) > 100 ? '100' : digits)
                  resetNotice()
                }}
              />
            )}
            <DateInputField
              label="Válido até"
              min={localDate(new Date())}
              value={expiresOn}
              isDisabled={busy}
              error={showMissing && missingDate ? 'Escolha até quando vale.' : undefined}
              onChange={(next) => {
                setExpiresOn(next)
                resetNotice()
              }}
            />
            <p className="apt-hint">
              {type === 'service'
                ? 'O atendimento desse serviço sai sem custo. Selecione o voucher ao criar o agendamento.'
                : 'Vale para um atendimento de preço fixo. Selecione o voucher ao criar o agendamento.'}
            </p>
            <Button type="submit" isDisabled={busy || Boolean(issued)}>
              <TicketPercent size={16} aria-hidden /> {busy ? 'Emitindo…' : 'Emitir voucher'}
            </Button>
          </form>
          {issued ? (
            <div className="manager-warning-box" role="status">
              <strong>
                {issued.destination === 'app'
                  ? 'Voucher disponível nas notificações do app.'
                  : issued.destination === 'email'
                    ? 'Voucher emitido. O envio por e-mail foi solicitado.'
                    : 'Voucher emitido.'}
              </strong>
              {share ? (
                <a
                  className="button button--secondary"
                  href={share}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle size={16} aria-hidden /> Compartilhar no WhatsApp
                </a>
              ) : null}
            </div>
          ) : null}
          {vouchers.length ? (
            <section className="cpf-packs" aria-label="Vouchers emitidos">
              <h3>Emitidos</h3>
              <ul>
                {vouchers.map((item) => (
                  <li className="cpf-pack" key={item.id}>
                    <strong>
                      {voucherDiscount(item)}
                      {item.discount_type === 'service' ? '' : ' de desconto'}
                    </strong>
                    <small>
                      {voucherStatus[item.status]} · válido até {dateBr(item.expires_on)}
                    </small>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <ClientPicker api={api} onPick={setClient} />
      )}
      {picking ? (
        <ServicePickerModal
          services={services}
          onClose={() => setPicking(false)}
          onPick={(item) => {
            setService(item)
            setPicking(false)
            resetNotice()
          }}
        />
      ) : null}
      {error || loadError ? (
        <p className="apt-error" role="alert">
          {error || loadError}
        </p>
      ) : null}
    </QuickModal>
  )
}
