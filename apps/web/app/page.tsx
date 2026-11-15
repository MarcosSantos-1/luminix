import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight, Check, MessageCircle } from 'lucide-react'
import { LandingHeader } from '../components/landing/landing-header'
import { LandingFooter } from '../components/landing/landing-footer'
import { Pricing } from '../components/landing/pricing'
import { SupportFab } from '../components/landing/support-fab'
import { VideoButton } from '../components/landing/video-button'
import { adminUrl } from '../lib/admin-url'
import { modules } from '../lib/modules'
import {
  PLAN_MONTHLY_PRICE,
  PLAN_YEARLY_PRICE,
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP_URL,
  TRIAL_DAYS,
  formatBRL,
} from '../lib/site'
import './landing.css'

const trialLabel = `Testar ${TRIAL_DAYS} dias grátis`

const swaps = [
  ['Caderno, planilha e cinco aplicativos', 'Agenda, financeiro e estoque juntos'],
  ['O dia inteiro respondendo WhatsApp', 'Atendimento com IA que agenda por você'],
  ['Sem tempo nem ideia para postar', 'Campanhas, dicas de post e imagens por IA'],
]

const audiences = [
  {
    id: 'studios',
    name: 'Studios',
    href: '/para/tatuagem',
    image: '/landing/studio.webp',
    alt: 'Tatuador de braços cruzados em seu estúdio',
    line: 'Sessões longas, sinal e portfólio.',
    tags: ['Tatuagem', 'Piercing', 'Sobrancelhas', 'Cílios'],
  },
  {
    id: 'saloes',
    name: 'Salões',
    href: '/para/cabeleireiras',
    image: '/landing/salao.webp',
    alt: 'Cabeleireira sorrindo em um salão com espelhos iluminados',
    line: 'Várias cadeiras, comissões e estoque.',
    tags: ['Cabelo', 'Unhas', 'Barbearia'],
  },
  {
    id: 'espacos',
    name: 'Espaços',
    href: '/para/estetica',
    image: '/landing/espaco.webp',
    alt: 'Terapeuta em uma sala de massagem aconchegante',
    line: 'Salas, pacotes e clientes que voltam.',
    tags: ['Massoterapia', 'Quiropraxia', 'Spa'],
  },
  {
    id: 'clinicas',
    name: 'Clínicas',
    href: '/para/estetica',
    image: '/landing/clinica.webp',
    alt: 'Esteticista de jaleco branco em uma clínica',
    line: 'Fichas, fotos de evolução e financeiro.',
    tags: ['Facial', 'Corporal', 'Depilação', 'Avançada'],
  },
]

const needs = [
  ['Celular ou computador', 'Funciona no navegador. Nada para instalar.'],
  ['Seus serviços', 'Nome, duração e preço de cada um.'],
  ['Seus horários', 'Dias e horas em que você atende.'],
  ['Nome do espaço', 'Logo e fotos são opcionais.'],
]

const steps = [
  ['Crie sua conta', 'E-mail e senha. Sem cartão.'],
  ['Configure seu espaço', 'Cadastro guiado, uma etapa por vez.'],
  ['Comece a usar', 'Agenda, clientes e financeiro prontos.'],
]

const questions = [
  [
    `Como funciona o teste de ${TRIAL_DAYS} dias?`,
    `Você cria a conta e usa o Luminix completo por ${TRIAL_DAYS} dias. Não pedimos cartão. No fim, você decide se continua.`,
  ],
  [
    'Quanto custa depois do teste?',
    `${formatBRL(PLAN_MONTHLY_PRICE)} por mês ou ${formatBRL(PLAN_YEARLY_PRICE)} por ano. Você paga no Pix ou no cartão.`,
  ],
  [
    'Serve para o meu tipo de negócio?',
    'Se você atende com hora marcada — studio, salão, espaço ou clínica — serve. Serviços, equipe e horários são configurados do seu jeito.',
  ],
  [
    'É só uma agenda?',
    'Não. A agenda é um dos módulos. O Luminix também cuida de financeiro, estoque, equipe, relatórios e do marketing do seu espaço.',
  ],
  [
    'Preciso entender de tecnologia?',
    'Não. O cadastro é guiado, e você pode parar e continuar depois.',
  ],
  [
    'Meus clientes também usam?',
    'Sim. Eles terão um app instalável para acompanhar horários e pacotes, e atendimento pelo WhatsApp. Esses recursos estão chegando em etapas.',
  ],
  [
    'Sou cliente de um espaço. Onde entro?',
    'Pela área “Sou cliente”. O portal está em preparação; até lá, confirme horários direto com o seu espaço.',
  ],
]

export default function HomePage() {
  return (
    <div className="lp" id="topo">
      <LandingHeader />
      <main id="conteudo">
        {/* ───────────── Hero ───────────── */}
        <section className="lp-hero" id="inicio" aria-labelledby="hero-title">
          <div className="lp-hero-copy">
            <p className="lp-kicker">Gestão completa para beleza e bem-estar</p>
            <h1 id="hero-title">
              Seu espaço inteiro <span className="lp-mark">num só lugar.</span>
            </h1>
            <p className="lp-lead">
              Agenda, clientes, financeiro, estoque, equipe e marketing. Um sistema prático e bonito
              para quem cuida de um espaço.
            </p>
            <div className="lp-hero-actions">
              <a className="lp-btn lp-btn-primary" href={adminUrl('/cadastro')}>
                {trialLabel} <ArrowRight size={18} aria-hidden />
              </a>
              <VideoButton>Ver em 2 minutos</VideoButton>
            </div>
            <ul className="lp-hero-notes">
              <li>
                <Check size={15} aria-hidden /> Sem cartão
              </li>
              <li>
                <Check size={15} aria-hidden /> Pix ou cartão depois
              </li>
              <li>
                <Check size={15} aria-hidden /> Nada para instalar
              </li>
            </ul>
          </div>

          <div className="lp-hero-visual">
            <span className="lp-dots lp-hero-dots" aria-hidden />
            <span className="lp-hero-block" aria-hidden />
            <div className="lp-hero-photo">
              <Image
                src="/landing/hero.webp"
                alt="Profissional de estética sorrindo em sua clínica"
                width={1392}
                height={1130}
                priority
                sizes="(min-width: 960px) 46vw, 92vw"
              />
            </div>
            <div className="lp-chip lp-chip-agenda" aria-hidden>
              <small>Seu dia · resumo</small>
              <div>
                <time>8</time>
                <span>
                  <b>Atendimentos hoje</b>2 a confirmar
                </span>
                <i>Agenda</i>
              </div>
              <div>
                <time>R$</time>
                <span>
                  <b>1.240,00 no caixa</b>3 pacotes vendidos
                </span>
                <i>Financeiro</i>
              </div>
            </div>
            <div className="lp-chip lp-chip-new" aria-hidden>
              <span className="lp-chip-dot" />
              <span>
                <b>Aniversariantes da semana</b>3 clientes · enviar mimo
              </span>
            </div>
            <a className="lp-sticker" href={adminUrl('/cadastro')} aria-label={trialLabel}>
              <b>{TRIAL_DAYS}</b>
              <span>
                dias
                <br />
                grátis
              </span>
            </a>
          </div>
        </section>

        {/* ───────────── O que é ───────────── */}
        <section className="lp-section lp-what" id="o-que-e" aria-labelledby="what-title">
          <span id="para-seu-espaco" aria-hidden />
          <div className="lp-what-visual">
            <span className="lp-what-panel" aria-hidden />
            <span className="lp-ring" aria-hidden />
            <Image
              src="/landing/devices.webp"
              alt="Painel do Luminix aberto em um notebook e em um celular"
              width={1400}
              height={933}
              sizes="(min-width: 960px) 52vw, 96vw"
            />
          </div>
          <div className="lp-what-copy">
            <p className="lp-kicker">O que é o Luminix</p>
            <h2 id="what-title">O maior aliado de quem tem um espaço.</h2>
            <p className="lp-lead">
              Um ecossistema de gestão: organiza o dia, cuida do dinheiro, atende seus clientes e
              ainda ajuda a divulgar o seu trabalho.
            </p>
            <ul className="lp-swaps">
              {swaps.map(([before, after]) => (
                <li key={before}>
                  <s>{before}</s>
                  <ArrowRight size={16} aria-hidden />
                  <strong>{after}</strong>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ───────────── Para quem ───────────── */}
        <section className="lp-section lp-who" id="para-quem" aria-labelledby="who-title">
          <div className="lp-heading">
            <p className="lp-kicker">Para quem é</p>
            <h2 id="who-title">Feito para o seu tipo de negócio.</h2>
          </div>
          <div className="lp-who-grid">
            {audiences.map((audience) => (
              <article className={`lp-who-card lp-who-${audience.id}`} key={audience.id}>
                <Link href={audience.href} className="lp-who-photo">
                  <Image
                    src={audience.image}
                    alt={audience.alt}
                    width={928}
                    height={878}
                    sizes="(min-width: 960px) 24vw, 80vw"
                  />
                  <h3 className="lp-who-tag">{audience.name}</h3>
                </Link>
                <p>{audience.line}</p>
                <ul>
                  {audience.tags.map((tag) => (
                    <li key={tag}>{tag}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {/* ───────────── Ecossistema ───────────── */}
        <section className="lp-section lp-feat" id="funcionalidades" aria-labelledby="feat-title">
          <div className="lp-heading lp-heading-row">
            <div>
              <p className="lp-kicker">Tudo em um sistema</p>
              <h2 id="feat-title">Muito além da agenda.</h2>
            </div>
            <Link className="lp-link" href="/funcionalidades">
              Ver todas as funcionalidades <ArrowUpRight size={17} aria-hidden />
            </Link>
          </div>
          <div className="lp-bento">
            <article className="lp-tile lp-tile-agenda">
              <div>
                <h3>Gestão do dia a dia</h3>
                <p>
                  Agenda, clientes, equipe e estoque conversando entre si. Você vê o espaço inteiro
                  em uma tela.
                </p>
              </div>
              <div className="lp-mini-agenda" aria-hidden>
                <div>
                  <time>Agenda</time>
                  <span style={{ ['--w' as string]: '86%' }}>8 atendimentos hoje</span>
                </div>
                <div>
                  <time>Equipe</time>
                  <span style={{ ['--w' as string]: '62%' }} data-tone="light">
                    4 profissionais
                  </span>
                </div>
                <div>
                  <time>Estoque</time>
                  <span style={{ ['--w' as string]: '74%' }}>2 itens acabando</span>
                </div>
                <div>
                  <time>Clientes</time>
                  <span style={{ ['--w' as string]: '50%' }} data-tone="light">
                    89 ativos
                  </span>
                </div>
              </div>
            </article>
            <article className="lp-tile lp-tile-clients">
              <div className="lp-bars" aria-hidden>
                <span style={{ ['--h' as string]: '38%' }} />
                <span style={{ ['--h' as string]: '56%' }} />
                <span style={{ ['--h' as string]: '47%' }} />
                <span style={{ ['--h' as string]: '72%' }} />
                <span style={{ ['--h' as string]: '100%' }} />
              </div>
              <h3>Financeiro e relatórios</h3>
              <p>Entradas, saídas, comissões e o que mais vende.</p>
            </article>
            <article className="lp-tile lp-tile-page">
              <Image
                src="/landing/unhas.webp"
                alt="Manicure finalizando unhas em tom rosé"
                width={1000}
                height={908}
                sizes="(min-width: 960px) 32vw, 92vw"
              />
              <div>
                <h3>Marketing e campanhas</h3>
                <p>Calendário de campanhas, dicas de postagem e imagens criadas por IA.</p>
              </div>
            </article>
            <article className="lp-tile lp-tile-team">
              <span className="lp-soon">Em breve</span>
              <h3>WhatsApp com IA</h3>
              <p>Agenda, confirma e lembra dos aniversários por você.</p>
              <span className="lp-dots" aria-hidden />
            </article>
            <article className="lp-tile lp-tile-devices">
              <span className="lp-soon">Em breve</span>
              <h3>App do cliente</h3>
              <p>Seus clientes instalam e acompanham horários e pacotes.</p>
            </article>
          </div>
          <ul className="lp-modules" aria-label="Módulos do Luminix">
            {modules.map((module) => (
              <li key={module.name} data-soon={module.soon || undefined}>
                {module.name}
                {module.soon && <i>em breve</i>}
              </li>
            ))}
          </ul>
        </section>

        {/* ───────────── Como começar ───────────── */}
        <section className="lp-section lp-start" id="como-comecar" aria-labelledby="start-title">
          <div className="lp-start-top">
            <div className="lp-start-visual">
              <span className="lp-dots" aria-hidden />
              <div className="lp-arch">
                <Image
                  src="/landing/laptop.webp"
                  alt="Esteticista sorrindo, pronta para começar"
                  width={514}
                  height={1003}
                  sizes="(min-width: 960px) 26vw, 60vw"
                />
              </div>
              <div className="lp-chip lp-chip-check lp-chip-check-1" aria-hidden>
                <Check size={14} /> Serviços cadastrados
              </div>
              <div className="lp-chip lp-chip-check lp-chip-check-2" aria-hidden>
                <Check size={14} /> Horários definidos
              </div>
            </div>
            <div className="lp-start-copy">
              <p className="lp-kicker">Para começar</p>
              <h2 id="start-title">Você só precisa de 4 coisas.</h2>
              <ol className="lp-needs">
                {needs.map(([title, text]) => (
                  <li key={title}>
                    <div>
                      <strong>{title}</strong>
                      <span>{text}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="lp-steps">
            <h3>Do cadastro ao primeiro cliente em 3 passos</h3>
            <ol>
              {steps.map(([title, text], index) => (
                <li key={title}>
                  <span aria-hidden>{index + 1}</span>
                  <strong>{title}</strong>
                  <p>{text}</p>
                </li>
              ))}
            </ol>
            <a className="lp-btn lp-btn-light" href={adminUrl('/cadastro')}>
              {trialLabel} <ArrowRight size={18} aria-hidden />
            </a>
          </div>
        </section>

        <Pricing />

        {/* ───────────── FAQ + suporte ───────────── */}
        <section className="lp-section lp-faq" id="duvidas" aria-labelledby="faq-title">
          <div className="lp-faq-side">
            <p className="lp-kicker">Dúvidas</p>
            <h2 id="faq-title">Perguntas de quem está começando.</h2>
            <div className="lp-support" id="suporte">
              <strong>Prefere falar com uma pessoa?</strong>
              <p>A gente responde em horário comercial.</p>
              <div>
                <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                  <MessageCircle size={16} aria-hidden /> WhatsApp
                </a>
                <a href={`mailto:${SUPPORT_EMAIL}`}>E-mail</a>
              </div>
            </div>
          </div>
          <div className="lp-faq-list">
            {questions.map(([question, answer]) => (
              <details key={question} name="faq">
                <summary>
                  {question}
                  <span aria-hidden />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ───────────── Clientes ───────────── */}
        <aside className="lp-client" id="para-clientes">
          <p>
            <strong>É cliente de um espaço que usa o Luminix?</strong> Seu caminho é outro.
          </p>
          <Link href="/acesso">
            Área do cliente <ArrowRight size={16} aria-hidden />
          </Link>
        </aside>

        {/* ───────────── CTA final ───────────── */}
        <section className="lp-final" aria-labelledby="final-title">
          <div className="lp-final-copy">
            <h2 id="final-title">Teste no seu espaço, com os seus clientes.</h2>
            <p>{TRIAL_DAYS} dias grátis, sem cartão, para ver o Luminix na sua rotina.</p>
            <div className="lp-hero-actions">
              <a className="lp-btn lp-btn-light" href={adminUrl('/cadastro')}>
                {trialLabel} <ArrowRight size={18} aria-hidden />
              </a>
              <VideoButton className="lp-play lp-play-on-dark">Ver o vídeo</VideoButton>
            </div>
          </div>
          <div className="lp-final-visual">
            <Image
              src="/landing/phone.webp"
              alt="Profissional usando o Luminix no celular"
              width={1000}
              height={1000}
              sizes="(min-width: 960px) 34vw, 80vw"
            />
          </div>
        </section>
      </main>
      <LandingFooter />
      <SupportFab afterId="inicio" />
    </div>
  )
}
