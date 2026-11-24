'use client'

import { Button, Switch, toast } from '@heroui/react'
import {
  Banknote,
  CalendarCheck2,
  Check,
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

/**
 * "E agora?" (ADR-041): after Stripe approves, takes the owner by the hand: switch on the
 * payment in the app, what the client sees, which services take part, cancellations and
 * where the money shows up.
 */
export function ConnectNextSteps({
  clinicRef,
  enabled,
  guideDone,
  onToggle,
  onDone,
  onOpenPayouts,
}: {
  clinicRef: string
  enabled: boolean
  guideDone: boolean
  /** Saves the switch; resolves false when it could not be saved. */
  onToggle: (next: boolean) => Promise<boolean>
  onDone: () => Promise<void>
  onOpenPayouts: () => void
}) {
  const [on, setOn] = useState(enabled)
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

      <div className={`connect-next-switch${on ? ' is-on' : ''}`}>
        <div>
          <strong>1. Ligue o pagamento pelo app</strong>
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

      <ol className="connect-next-list">
        {steps.map(({ icon: Icon, title, text, action }, index) => (
          <li key={title}>
            <span className="connect-next-num" aria-hidden>
              <Icon size={18} aria-hidden />
            </span>
            <div>
              <strong>
                {index + 2}. {title}
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
        <p className="connect-next-done">
          <Check size={16} aria-hidden /> Você já concluiu este guia.
        </p>
      ) : (
        <Button className="connect-primary" isDisabled={busy} onPress={() => void onDone()}>
          <Check size={18} aria-hidden /> Entendi, concluir
        </Button>
      )}
    </section>
  )
}
