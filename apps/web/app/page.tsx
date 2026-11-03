import Link from 'next/link'
import {
  ArrowRight,
  CalendarDays,
  Check,
  Heart,
  Palette,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import { SiteHeader } from '../components/marketing/site-header'
import { SiteFooter } from '../components/marketing/site-footer'
import { adminUrl } from '../lib/admin-url'
import './marketing.css'

const questions = [
  [
    'O Luminix é para o meu tipo de espaço?',
    'A configuração foi pensada para clínicas de estética, salões, studios e profissionais autônomas. Você organiza o perfil do seu espaço, serviços, equipe e horários de acordo com a sua rotina.',
  ],
  [
    'Preciso entender de tecnologia para começar?',
    'O cadastro é guiado, uma etapa por vez. Você pode preparar as informações do espaço, revisar o que preencheu e retomar a configuração depois.',
  ],
  [
    'Sou cliente de uma clínica. Onde entro?',
    'Use a área “Sou cliente”. O portal de clientes está em preparação; por enquanto, fale com a sua clínica ou studio pelo canal que você já utiliza para confirmar atendimentos e pagamentos. A demonstração do site não é um login.',
  ],
  [
    'Já posso receber pagamentos pelo Luminix?',
    'Ainda não. O cadastro financeiro está em ambiente de teste. Cobranças, pacotes e assinaturas serão disponibilizados em etapas; configurar preferências não movimenta dinheiro.',
  ],
  [
    'O aplicativo para celular já está disponível?',
    'Os aplicativos estão em desenvolvimento. Hoje, a gestão pode ser acessada pelo navegador do celular ou do computador. Não é necessário baixar um app para preparar seu espaço.',
  ],
]

export default function HomePage() {
  return (
    <div className="marketing" id="topo">
      <SiteHeader />
      <main id="conteudo">
        <section className="marketing-hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <span className="section-kicker">
              <Sparkles size={16} aria-hidden /> Feito para quem cuida
            </span>
            <h1 id="hero-title">
              Seu talento é cuidar.
              <br />
              <em>
                A gestão pode
                <br className="desktop-break" /> ser mais leve.
              </em>
            </h1>
            <p>
              Um lugar para organizar seu espaço, sua equipe e sua agenda. Com clareza para você
              focar no que faz de melhor.
            </p>
            <div className="hero-actions">
              <a className="marketing-button primary" href={adminUrl('/cadastro')}>
                Começar com meu espaço <ArrowRight size={19} aria-hidden />
              </a>
              <a className="text-link" href="#como-comecar">
                Conhecer os primeiros passos ↓
              </a>
            </div>
            <div className="hero-reassurance">
              <span>
                <Check size={15} aria-hidden /> Cadastro guiado
              </span>
              <span>
                <Check size={15} aria-hidden /> No celular e no computador
              </span>
            </div>
            <Link className="client-shortcut" href="/acesso">
              Veio como cliente de uma clínica ou studio?{' '}
              <span>
                Este é seu caminho <ArrowRight size={15} aria-hidden />
              </span>
            </Link>
          </div>
          <div
            className="routine-preview"
            aria-label="Exemplo ilustrativo da organização de um espaço"
          >
            <div className="routine-top">
              <span className="routine-symbol">
                <Sparkles size={18} aria-hidden />
              </span>
              <span>
                Meu espaço<small>Prévia ilustrativa</small>
              </span>
              <span className="routine-avatar" aria-hidden>
                M
              </span>
            </div>
            <div className="routine-heading">
              <span>UM DIA COM MAIS CLAREZA</span>
              <h2>
                Bom dia, Marina <span aria-hidden>☀</span>
              </h2>
              <p>Cada cuidado, no seu tempo.</p>
            </div>
            <div className="routine-date">
              <CalendarDays size={18} aria-hidden />
              <strong>Sua agenda</strong>
              <span>Exemplo</span>
            </div>
            <ol className="routine-list">
              <li>
                <time>09:00</time>
                <span>
                  <strong>Limpeza de pele</strong>
                  <small>Ana · Sala 01</small>
                </span>
                <span className="routine-status">Confirmado</span>
              </li>
              <li>
                <time>10:30</time>
                <span>
                  <strong>Design de sobrancelhas</strong>
                  <small>Luiza · Sala 02</small>
                </span>
                <span className="routine-status">Confirmado</span>
              </li>
              <li>
                <time>14:00</time>
                <span>
                  <strong>Massagem relaxante</strong>
                  <small>Clara · Sala 01</small>
                </span>
                <span className="routine-status soft">Agendado</span>
              </li>
            </ol>
            <div className="routine-note">
              <Heart size={20} aria-hidden />
              <p>
                Uma rotina organizada abre espaço
                <br />
                para um atendimento mais próximo.
              </p>
            </div>
          </div>
        </section>
        <div className="audience-strip" aria-label="Para diferentes tipos de negócio">
          <span>Seu espaço, do seu jeito.</span>
          <p>
            Clínicas de estética <i aria-hidden>✦</i> Salões <i aria-hidden>✦</i> Studios{' '}
            <i aria-hidden>✦</i> Autônomas
          </p>
        </div>
        <section className="marketing-section" id="para-seu-espaco" aria-labelledby="space-title">
          <div className="section-heading">
            <span className="section-kicker">PARA QUEM EMPREENDE NO CUIDADO</span>
            <h2 id="space-title">
              Menos informação espalhada.
              <br />
              <em>Mais clareza na sua rotina.</em>
            </h2>
            <p>
              Comece pela base: um espaço bem configurado e as informações que você precisa por
              perto.
            </p>
          </div>
          <div className="benefit-grid">
            {[
              {
                icon: CalendarDays,
                title: 'Uma agenda para organizar o dia',
                text: 'Visualize atendimentos e ajuste os horários de funcionamento do espaço.',
              },
              {
                icon: Users,
                title: 'Clientes e equipe, cada um no seu lugar',
                text: 'Reúna cadastros e prepare o perfil das profissionais, serviços e horários.',
              },
              {
                icon: Palette,
                title: 'A identidade do seu espaço',
                text: 'Escolha sua paleta, adicione sua marca e configure os detalhes que fazem seu negócio ser seu.',
              },
            ].map(({ icon: Icon, title, text }) => (
              <article className="benefit" key={title}>
                <span className="benefit-icon">
                  <Icon size={24} aria-hidden />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section
          className="start-section marketing-section"
          id="como-comecar"
          aria-labelledby="start-title"
        >
          <div className="section-heading">
            <span className="section-kicker">SEM PRECISAR RESOLVER TUDO DE UMA VEZ</span>
            <h2 id="start-title">
              Seu começo,
              <br />
              <em>passo a passo.</em>
            </h2>
            <p>Você conhece o seu negócio. A gente ajuda a colocar as informações no lugar.</p>
            <a className="marketing-button primary" href={adminUrl('/cadastro')}>
              Preparar meu espaço <ArrowRight size={18} aria-hidden />
            </a>
          </div>
          <ol className="start-steps">
            <li>
              <span>01</span>
              <div>
                <h3>Crie sua conta</h3>
                <p>Seus dados de acesso para entrar na gestão com segurança.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Conte sobre seu espaço</h3>
                <p>Marca, serviços, equipe e horários em uma configuração guiada.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Revise e organize sua rotina</h3>
                <p>
                  Confira os detalhes e continue para o painel. Novas funcionalidades chegam em
                  etapas.
                </p>
              </div>
            </li>
          </ol>
        </section>
        <section className="client-section" id="para-clientes" aria-labelledby="client-title">
          <div className="client-section-copy">
            <span className="section-kicker">
              <Heart size={16} aria-hidden /> PARA VOCÊ, CLIENTE
            </span>
            <h2 id="client-title">
              Seu próximo cuidado
              <br />
              começa com o seu espaço.
            </h2>
            <p>
              Você é cliente de uma clínica, salão ou studio? Esse caminho é seu — separado da
              gestão do negócio.
            </p>
            <Link className="marketing-button light" href="/acesso">
              Ir para a área da cliente <ArrowRight size={18} aria-hidden />
            </Link>
          </div>
          <div className="client-guide">
            <ShieldCheck size={27} aria-hidden />
            <h3>Vamos te orientar por aqui.</h3>
            <p>
              O portal de clientes está em preparação. Por enquanto, confirme horários e informações
              diretamente com o estabelecimento.
            </p>
            <Link href="/c/demonstracao">
              Explorar uma página de exemplo <ArrowRight size={16} aria-hidden />
            </Link>
            <small>Demonstração, sem login ou agendamento real.</small>
          </div>
        </section>
        <section className="marketing-section faq-section" id="duvidas" aria-labelledby="faq-title">
          <div className="section-heading">
            <span className="section-kicker">PODE PERGUNTAR</span>
            <h2 id="faq-title">
              Um pouco mais
              <br />
              <em>de clareza.</em>
            </h2>
          </div>
          <div className="faq-list">
            {questions.map(([question, answer]) => (
              <details key={question} name="faq">
                <summary>
                  {question}
                  <span aria-hidden>+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="final-invite">
          <Sparkles size={25} aria-hidden />
          <h2>Vamos preparar seu espaço?</h2>
          <p>Um primeiro passo simples para uma rotina mais organizada.</p>
          <a className="marketing-button primary" href={adminUrl('/cadastro')}>
            Criar minha conta <ArrowRight size={18} aria-hidden />
          </a>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
