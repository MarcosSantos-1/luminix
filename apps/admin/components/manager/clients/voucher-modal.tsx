'use client'

import { Button } from '@heroui/react'
import { MessageCircle, TicketPercent } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { DateInputField, MoneyField, SelectField, TextInputField } from '@/components/ui/fields'
import { localDate } from '../appointments/model'
import { dateBr, money, parseMoney, whatsapp } from '../business/format'
import { QuickModal } from '../quick-modal'
import { ClientPicker, type ClientChoice } from './client-picker'
import type { ClinicApi } from '../settings/clinic-api'

export type ClientVoucher = {
  id: string
  discount_type: 'fixed' | 'percent'
  discount_value: number
  expires_on: string
  status: 'available' | 'expired' | 'used'
}

export function voucherDiscount({ discount_type, discount_value }: ClientVoucher) {
  return discount_type === 'percent' ? `${discount_value}%` : money(discount_value)
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
  const value = type === 'percent' ? Number(amount) : parseMoney(amount)
  const canSubmit =
    value != null &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= (type === 'percent' ? 100 : 100000000) &&
    expiresOn >= localDate(new Date())

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
    if (!path || busy || !canSubmit || value == null || issued) return
    setBusy(true)
    setError('')
    try {
      const result = await api.post<{ id: string; destination: 'app' | 'email' | 'manual' }>(path, {
        id: submitId,
        type,
        value,
        expiresOn,
      })
      const voucher: ClientVoucher = {
        id: result.id,
        discount_type: type,
        discount_value: value,
        expires_on: expiresOn,
        status: 'available',
      }
      setVouchers((current) => [voucher, ...current.filter((item) => item.id !== voucher.id)])
      setIssued({
        destination: result.destination,
        text: `Você recebeu um voucher de ${voucherDiscount(voucher)} de desconto para um atendimento até ${dateBr(expiresOn)}. Fale com o espaço para usar.`,
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
              label="Tipo de desconto"
              value={type}
              isDisabled={busy}
              options={[
                { id: 'percent', label: 'Porcentagem' },
                { id: 'fixed', label: 'Valor em reais' },
              ]}
              onChange={(next) => {
                setType(next === 'fixed' ? 'fixed' : 'percent')
                setAmount('')
                resetNotice()
              }}
            />
            {type === 'fixed' ? (
              <MoneyField
                label="Valor do desconto"
                value={amount}
                isDisabled={busy}
                onChange={(next) => {
                  setAmount(next)
                  resetNotice()
                }}
              />
            ) : (
              <TextInputField
                label="Desconto (%)"
                inputMode="numeric"
                maxLength={3}
                value={amount}
                isDisabled={busy}
                onChange={(next) => {
                  setAmount(next.replace(/\D/g, ''))
                  resetNotice()
                }}
              />
            )}
            <DateInputField
              label="Válido até"
              min={localDate(new Date())}
              value={expiresOn}
              isDisabled={busy}
              onChange={(next) => {
                setExpiresOn(next)
                resetNotice()
              }}
            />
            <p className="apt-hint">
              Vale para um atendimento de preço fixo. Selecione o voucher ao criar o agendamento.
            </p>
            <Button type="submit" isDisabled={busy || !canSubmit || Boolean(issued)}>
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
                    <strong>{voucherDiscount(item)} de desconto</strong>
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
      {error || loadError ? (
        <p className="apt-error" role="alert">
          {error || loadError}
        </p>
      ) : null}
    </QuickModal>
  )
}
