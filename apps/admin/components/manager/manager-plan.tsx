'use client'

import { ChevronRight, Crown } from 'lucide-react'
import { QuickModal } from './quick-modal'
import { supportWhatsAppUrl } from './support'

export function planStatus(endsAt: string | null | undefined, now: number) {
  if (!endsAt) return '12 dias gratuitos'
  const left = Math.ceil((Date.parse(endsAt) - now) / 86_400_000)
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
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  status: string
  endsAt?: string | null
}) {
  return (
    <QuickModal isOpen={isOpen} onOpenChange={onOpenChange} title="Meu plano">
      <div className="manager-plan-details">
        <section>
          <h3>{status}</h3>
          <p>O período gratuito dura 12 dias a partir da conclusão do cadastro do espaço.</p>
          {endsAt ? (
            <p>
              Fim do período gratuito em{' '}
              {new Intl.DateTimeFormat('pt-BR', {
                dateStyle: 'long',
                timeZone: 'America/Sao_Paulo',
              }).format(new Date(endsAt))}
              .
            </p>
          ) : null}
        </section>
        <section>
          <h3>Pagamento da assinatura</h3>
          <p>Pagamento por Pix ou cartão e renovação automática estão em preparação.</p>
        </section>
        <section>
          <h3>Acesso e prazo de pagamento</h3>
          <p>
            A gestão segue liberada durante a preparação da cobrança. As opções de prazo adicional e
            os avisos de bloqueio também estão em preparação.
          </p>
        </section>
        <a
          className="button button--secondary"
          href={supportWhatsAppUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Falar com o suporte
        </a>
      </div>
    </QuickModal>
  )
}
