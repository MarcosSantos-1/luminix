import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Heart, MessageCircle } from 'lucide-react'
import { SiteHeader } from '../../components/marketing/site-header'
import { SiteFooter } from '../../components/marketing/site-footer'
import { adminUrl } from '../../lib/admin-url'
import '../marketing.css'

export const metadata: Metadata = { title: 'Área da cliente' }

export default function AcessoPage() {
  return (
    <div className="marketing" id="topo">
      <SiteHeader />
      <main className="client-access-main" id="conteudo">
        <span className="section-kicker">
          <Heart size={16} aria-hidden /> CLIENTES DE CLÍNICAS, SALÕES E STUDIOS
        </span>
        <h1>
          Você está no lugar certo.
          <br />
          <em>Vamos te orientar.</em>
        </h1>
        <p>
          Esta área é para quem recebe os cuidados. O portal de clientes está em preparação; por
          enquanto, não é preciso informar CPF ou senha por aqui.
        </p>
        <div className="client-access-grid">
          <section className="client-access-card">
            <MessageCircle size={28} aria-hidden />
            <h2>Já frequenta um espaço?</h2>
            <p>
              Fale com a clínica, salão ou studio pelo canal que você já utiliza. A equipe pode
              confirmar seu horário, informar sobre pagamentos e orientar o atendimento.
            </p>
            <p>
              Quando o acesso pelo Luminix estiver disponível, o estabelecimento poderá orientar
              você sobre como entrar.
            </p>
          </section>
          <section className="client-access-card">
            <Heart size={28} aria-hidden />
            <h2>Quer conhecer a experiência?</h2>
            <p>
              Explore uma página ilustrativa de clínica, com serviços e informações de exemplo. Ela
              não faz agendamentos, cobranças ou acesso a dados pessoais.
            </p>
            <Link className="marketing-button primary" href="/c/demonstracao">
              Ver demonstração <ArrowRight size={18} aria-hidden />
            </Link>
          </section>
        </div>
        <p>
          Você gerencia um estabelecimento?{' '}
          <a className="text-link" href={adminUrl('/login')}>
            Entre na gestão do seu espaço <ArrowRight size={16} aria-hidden />
          </a>
        </p>
      </main>
      <SiteFooter />
    </div>
  )
}
