'use client'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useClinic } from '@/components/clinic-workspace'
import {
  ManagerAppearanceShell,
  ManagerDesignButton,
} from '@/components/manager/manager-appearance'
import { ConnectPanel } from '@/components/payments/connect-panel'
import { useStaff } from '@/components/staff-provider'
import '@/app/dashboard/manager.css'

export default function ReceiptsPage() {
  const { clinic, permissions } = useClinic()
  const { user } = useStaff()
  const canManage = permissions.includes('settings:manage')
  const base = `/c/${clinic.share_code || clinic.id}`
  return (
    <ManagerAppearanceShell
      className="manager-shell manager-receipts-page"
      data-theme="manager-glass"
      legacyScope={user ? `${user.uid}/${clinic.id}` : undefined}
    >
      <main className="manager-main">
        <header className="manager-header">
          <Link
            className="manager-receipts-link"
            href={canManage ? `${base}?secao=financeiro` : base}
          >
            <ArrowLeft size={16} aria-hidden />
            {canManage ? 'Voltar ao Financeiro' : 'Voltar ao painel'}
          </Link>
          <ManagerDesignButton />
        </header>
        <h1>Receber pelo app</h1>
        {canManage && (
          <p className="manager-receipts-intro">
            Com o pagamento pelo app, sua cliente paga por Pix ou cartão na hora de agendar e o
            dinheiro cai na conta do espaço. Quem cuida do pagamento e do depósito é a Stripe,
            empresa usada por milhões de negócios no mundo; o Luminix nunca vê cartão nem dados
            bancários. É opcional: sem ele, você continua recebendo no espaço como sempre.
          </p>
        )}
        <ConnectPanel dashboard />
      </main>
    </ManagerAppearanceShell>
  )
}
