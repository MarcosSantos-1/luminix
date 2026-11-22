'use client'

import Image from 'next/image'
import {
  CalendarDays,
  ChevronRight,
  Clock3,
  CreditCard,
  Crown,
  MessageCircle,
  ShieldCheck,
  Store,
} from 'lucide-react'
import { QuickModal } from './quick-modal'
import { supportWhatsAppUrl } from './support'

function remainingDays(end: number, now: number) {
  return Math.max(0, Math.min(12, Math.ceil((end - now) / 86_400_000)))
}

export function planStatus(endsAt: string | null | undefined, now: number) {
  if (!endsAt || !Number.isFinite(Date.parse(endsAt))) return '12 dias gratuitos'
  const left = remainingDays(Date.parse(endsAt), now)
  if (left <= 0) return 'Período gratuito encerrado'
  return left === 1 ? 'Falta 1 dia' : `Faltam ${left} dias`
}

export function PlanCard({ status, onOpen }: { status: string; onOpen: () => void }) {
  return (
    <button className="manager-plan card" type="button" onClick={onOpen}>
      <Crown size={20} aria-hidden />
      <span>
        <strong>Meu plano</strong>
        <small>{status}</small>
      </span>
      <ChevronRight size={16} aria-hidden />
    </button>
  )
}

export function PlanModal({
  isOpen,
  onOpenChange,
  status,
  endsAt,
  now,
  clinicName,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  status: string
  now: number
  clinicName: string
  endsAt?: string | null
}) {
  const endTime = endsAt ? Date.parse(endsAt) : NaN
  const remaining = Number.isFinite(endTime) ? remainingDays(endTime, now) : 12
  const endDate = Number.isFinite(endTime)
    ? new Intl.DateTimeFormat('pt-BR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'America/Sao_Paulo',
      }).format(endTime)
    : null
  return (
    <QuickModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Meu plano"
      size="lg"
      className="plan-dialog"
      badge={
        <>
          <Crown size={13} aria-hidden /> Luminix
        </>
      }
      hero={
        <>
          <div className="qm-hero-art">
            <Image
              src="/brand/onboarding/ministudio-illustration.png"
              width={220}
              height={220}
              sizes="(max-width: 650px) 62px, 200px"
              alt=""
            />
          </div>
          <ul className="qm-hero-facts">
            <li>
              <Store size={16} aria-hidden />
              {clinicName}
            </li>
          </ul>
        </>
      }
      footer={
        <a
          className="button button--secondary plan-support"
          href={supportWhatsAppUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle size={17} aria-hidden />
          Falar com o suporte
        </a>
      }
    >
      <section className="plan-period" aria-label="Período gratuito">
        <span>
          <Clock3 size={16} aria-hidden />
          Período gratuito
        </span>
        <h3>{status}</h3>
        <div className="plan-days" aria-hidden>
          {Array.from({ length: 12 }, (_, index) => (
            <i key={index} data-elapsed={index < 12 - remaining} />
          ))}
        </div>
        <p>
          <CalendarDays size={15} aria-hidden />
          {endDate ? `Término em ${endDate}` : 'Começa ao concluir o cadastro do espaço'}
        </p>
      </section>
      <dl className="plan-facts">
        <div>
          <dt>
            <ShieldCheck size={19} aria-hidden />
            Acesso ao painel
          </dt>
          <dd>
            <strong>Gestão liberada</strong>
            <small>Seu espaço continua aberto após o teste enquanto preparamos a cobrança.</small>
          </dd>
        </div>
        <div>
          <dt>
            <CreditCard size={19} aria-hidden />
            Assinatura
          </dt>
          <dd>
            <strong>Em breve · Pix e cartão</strong>
            <small>
              Você poderá ativar a renovação automática, pedir mais prazo e acompanhar avisos de
              bloqueio.
            </small>
          </dd>
        </div>
      </dl>
    </QuickModal>
  )
}
