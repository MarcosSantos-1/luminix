import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Área do cliente — Em preparação',
  robots: { index: false, follow: false },
}

export default async function ClientPlanPage({ params }: { params: Promise<{ clinica: string }> }) {
  const { clinica } = await params
  return (
    <section className="panel">
      <p className="eyebrow">Área do cliente · Em preparação</p>
      <h1>Seu plano, em breve.</h1>
      <p className="lead">
        Esta rota está reservada. O acesso a planos dependerá do login e da validação do vínculo do
        cliente com a clínica pela API. Não há formulário de login ou dados privados nesta página.
      </p>
      <Link className="button" href={`/c/${encodeURIComponent(clinica)}`}>
        Voltar à página da clínica
      </Link>
    </section>
  )
}
