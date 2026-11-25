'use client'

import { Button, Switch, toast } from '@heroui/react'
import {
  Banknote,
  CalendarCheck2,
  Check,
  ChevronRight,
  CreditCard,
  Landmark,
  ListChecks,
  RotateCcw,
  Smartphone,
  Tags,
} from 'lucide-react'
import Link from 'next/link'
import { useState, type ComponentType } from 'react'

type Step = {
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>
  title: string
  text: string
  action?: { label: string; href?: string; onPress?: () => void }
}

/** Saves the switch; resolves false when it could not be saved. */
type SaveToggle = (next: boolean) => Promise<boolean>

/** "Clientes pagam pelo app" on/off, shared by the guide and the hub. */
function InAppSwitch({
  enabled,
  onToggle,
  label,
}: {
  enabled: boolean
  onToggle: SaveToggle
  label: string
}) {
  const [on, setOn] = useState(enabled)
  const [busy, setBusy] = useState(false)
  async function toggle(next: boolean) {
    setBusy(true)
    setOn(next)
    const saved = await onToggle(next)
    if (!saved) setOn(!next)
    else
      toast.success(
        next
          ? 'Pronto! Suas clientes já podem pagar pelo app.'
          : 'Pagamento pelo app desligado. As clientes pagam no espaço.',
      )
    setBusy(false)
  }
  return (
    <div className={`connect-next-switch${on ? ' is-on' : ''}`}>
      <div>
        <strong>{label}</strong>
        <span>
          {on
            ? 'Ligado: Pix e cartão já aparecem para as clientes ao agendar.'
            : 'Desligado: as clientes continuam pagando no espaço.'}
        </span>
      </div>
      <Switch
        isSelected={on}
        isDisabled={busy}
        onChange={(next) => void toggle(next)}
        aria-label="Clientes pagam pelo app"
      >
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Content>
      </Switch>
    </div>
  )
}

/**
 * "E agora?" (ADR-041): after Stripe approves, takes the owner by the hand: switch on the
 * payment in the app, what the client sees, which services take part, cancellations and
 * where the money shows up. Once finished it can be reopened from the hub.
 */
export function ConnectNextSteps({
  clinicRef,
  enabled,
  guideDone,
  onToggle,
  onDone,
  onClose,
  onOpenPayouts,
}: {
  clinicRef: string
  enabled: boolean
  guideDone: boolean
  onToggle: SaveToggle
  onDone: () => Promise<void>
  /** Reopened from the hub: closes it again. */
  onClose?: () => void
  onOpenPayouts: () => void
}) {
  const [busy, setBusy] = useState(false)
  const base = `/c/${clinicRef}`
  const steps: Step[] = [
    {
      icon: Smartphone,
      title: 'Como a cliente paga',
      text: 'Ao agendar pelo site ou pelo app, ela escolhe Pix ou cartão e paga numa página segura da Stripe. O horário fica guardado por 30 minutos até o pagamento; se ela não pagar, o horário volta a ficar livre.',
    },
    {
      icon: Tags,
      title: 'Quais serviços entram',
      text: 'Serviços com preço fixo. "A combinar" e "a partir de" continuam pagos no espaço, porque o valor só é definido no atendimento. Pagar no local continua sempre disponível.',
      action: { label: 'Conferir serviços', href: `${base}?secao=servicos` },
    },
    {
      icon: RotateCcw,
      title: 'Cancelamentos e devoluções',
      text: 'Se a cliente cancelar dentro do seu prazo, ou se você cancelar, o valor volta inteiro para ela automaticamente. Em outros casos (uma falta, por exemplo) você decide e devolve pelo botão "Estornar" no atendimento.',
    },
    {
      icon: Banknote,
      title: 'Onde o dinheiro aparece',
      text: 'Cada pagamento entra sozinho no Financeiro como "Pago pelo app". O depósito na sua conta bancária segue o prazo da Stripe: Pix e boleto em cerca de 2 dias úteis, cartão em cerca de 30 dias.',
      action: { label: 'Ver repasses', onPress: onOpenPayouts },
    },
    {
      icon: CalendarCheck2,
      title: 'No dia a dia',
      text: 'Na agenda, o horário mostra "Aguardando pagamento" enquanto a cliente paga e "Pago" depois. Você não precisa fazer nada para lançar o valor.',
      action: { label: 'Abrir agenda', href: `${base}?secao=agenda` },
    },
  ]

  async function done() {
    setBusy(true)
    await onDone()
    setBusy(false)
  }

  return (
    <section id="proximos-passos" className="connect-next" aria-labelledby="connect-next-title">
      <header>
        <span className="connect-next-icon" aria-hidden>
          <ListChecks size={20} />
        </span>
        <div>
          <h3 id="connect-next-title">E agora? Seus próximos passos</h3>
          <p>Tudo o que muda com o pagamento pelo app, em poucos minutos.</p>
        </div>
      </header>

      {guideDone ? null : (
        <InAppSwitch enabled={enabled} onToggle={onToggle} label="1. Ligue o pagamento pelo app" />
      )}

      <ol className="connect-next-list">
        {steps.map(({ icon: Icon, title, text, action }, index) => (
          <li key={title}>
            <span className="connect-next-num" aria-hidden>
              <Icon size={18} aria-hidden />
            </span>
            <div>
              <strong>
                {guideDone ? '' : `${index + 2}. `}
                {title}
              </strong>
              <p>{text}</p>
              {action ? (
                action.href ? (
                  <Link className="connect-next-link" href={action.href}>
                    {action.label} →
                  </Link>
                ) : (
                  <button type="button" className="connect-next-link" onClick={action.onPress}>
                    {action.label} →
                  </button>
                )
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {guideDone ? (
        onClose ? (
          <Button variant="secondary" onPress={onClose}>
            Fechar guia
          </Button>
        ) : null
      ) : (
        <Button className="connect-primary" isDisabled={busy} onPress={() => void done()}>
          <Check size={18} aria-hidden /> Entendi, concluir
        </Button>
      )}
    </section>
  )
}

/**
 * The page once everything is set up: no sign-up talk, just the switch and the doors to
 * what the owner checks day to day (bank details, payments and refunds, payouts).
 */
export type PackageMode = 'clinic_only' | 'in_app' | 'both'
const packageModes: { value: PackageMode; label: string; hint: string }[] = [
  { value: 'clinic_only', label: 'No espaço', hint: 'Combina e parcela com a equipe.' },
  { value: 'in_app', label: 'Pelo app', hint: 'À vista, Pix ou cartão.' },
  { value: 'both', label: 'A cliente escolhe', hint: 'App à vista ou no espaço.' },
]

/** How packages are paid when the client books one (ADR-044). */
function PackageModePicker({
  mode,
  onChange,
}: {
  mode: PackageMode
  onChange: (next: PackageMode) => Promise<boolean>
}) {
  const [current, setCurrent] = useState(mode)
  const [busy, setBusy] = useState(false)
  async function pick(next: PackageMode) {
    if (next === current || busy) return
    const previous = current
    setBusy(true)
    setCurrent(next)
    if (!(await onChange(next))) setCurrent(previous)
    else toast.success('Forma de pagamento dos pacotes salva.')
    setBusy(false)
  }
  return (
    <div className="connect-package-mode">
      <div>
        <strong>Pacotes agendados pelo app</strong>
        <span>
          Como a cliente paga um pacote ao agendar a primeira sessão. Parcelado fica sempre no
          espaço.
        </span>
      </div>
      <div className="connect-package-options" role="radiogroup" aria-label="Pagamento dos pacotes">
        {packageModes.map(({ value, label, hint }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={current === value}
            disabled={busy}
            onClick={() => void pick(value)}
          >
            <i aria-hidden />
            <strong>{label}</strong>
            <small>{hint}</small>
          </button>
        ))}
      </div>
    </div>
  )
}

export function ConnectHub({
  enabled,
  onToggle,
  onOpen,
  disabled,
  packageMode,
  onPackageMode,
}: {
  enabled: boolean
  onToggle: SaveToggle
  onOpen: (purpose: 'management' | 'payments' | 'payouts') => void
  disabled: boolean
  packageMode: PackageMode
  onPackageMode: (next: PackageMode) => Promise<boolean>
}) {
  const doors = [
    {
      purpose: 'payments' as const,
      icon: CreditCard,
      title: 'Pagamentos e reembolsos',
      text: 'Cada pagamento recebido, devoluções e contestações.',
    },
    {
      purpose: 'payouts' as const,
      icon: Banknote,
      title: 'Repasses',
      text: 'Quanto e quando a Stripe depositou na sua conta.',
    },
    {
      purpose: 'management' as const,
      icon: Landmark,
      title: 'Dados e conta bancária',
      text: 'Confira ou altere a conta que recebe e os dados do espaço.',
    },
  ]
  return (
    <section className="connect-hub" aria-label="Pagamento pelo app">
      <InAppSwitch enabled={enabled} onToggle={onToggle} label="Clientes pagam pelo app" />
      <PackageModePicker mode={packageMode} onChange={onPackageMode} />
      <div className="connect-hub-doors">
        {doors.map(({ purpose, icon: Icon, title, text }) => (
          <button
            key={purpose}
            type="button"
            className="connect-hub-door"
            disabled={disabled}
            onClick={() => onOpen(purpose)}
          >
            <span className="connect-next-icon" aria-hidden>
              <Icon size={20} />
            </span>
            <span className="connect-hub-door-copy">
              <strong>{title}</strong>
              <span>{text}</span>
            </span>
            <ChevronRight size={18} aria-hidden className="connect-hub-door-arrow" />
          </button>
        ))}
      </div>
    </section>
  )
}
