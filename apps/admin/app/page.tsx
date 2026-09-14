'use client'

import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Copy,
  CreditCard,
  Gem,
  HeartPulse,
  Home,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Plus,
  Settings2,
  Sparkles,
  Stethoscope,
  Users,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'

const steps = [
  { title: 'Sua clínica', icon: Building2 },
  { title: 'Serviços', icon: Sparkles },
  { title: 'Estrutura', icon: Home },
  { title: 'Equipe', icon: Users },
  { title: 'Funcionamento', icon: CalendarDays },
  { title: 'Configuração', icon: Settings2 },
  { title: 'Conclusão', icon: Check },
]

const services = [
  'Depilação a laser',
  'Limpeza de pele',
  'Massagem corporal',
  'Peeling químico',
  'Design de sobrancelhas',
  'Outros',
]
const roles = [
  'Esteticistas',
  'Recepcionistas',
  'Massoterapeutas',
  'Biomédica',
  'Fisioterapeuta',
  'Outras',
]

function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`brand ${dark ? 'brand-dark' : ''}`}>
      <span className="brand-mark">L</span>
      <span>Luminix</span>
    </div>
  )
}

function Button({
  children,
  variant = 'primary',
  onClick,
  className = '',
  type = 'button',
}: {
  children: React.ReactNode
  variant?: 'primary' | 'ghost' | 'soft'
  onClick?: () => void
  className?: string
  type?: 'button' | 'submit'
}) {
  return (
    <button type={type} onClick={onClick} className={`button button-${variant} ${className}`}>
      {children}
    </button>
  )
}

function Field({
  label,
  value,
  icon: Icon,
  onChange,
}: {
  label: string
  value: string
  icon?: React.ElementType
  onChange?: (value: string) => void
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="field-control">
        {Icon && <Icon size={17} />}
        <input value={value} onChange={(e) => onChange?.(e.target.value)} />
      </div>
    </label>
  )
}

function StepCard({
  number,
  title,
  description,
  icon: Icon,
  children,
  onContinue,
  onBack,
}: {
  number: number
  title: string
  description: string
  icon: React.ElementType
  children: React.ReactNode
  onContinue: () => void
  onBack?: () => void
}) {
  return (
    <section className="step-card">
      <div className="step-heading">
        <div className="step-icon">
          <Icon size={24} />
        </div>
        <div>
          <div className="step-kicker">
            <b>{number}</b>
            <span>Etapa {number} de 7</span>
          </div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="step-content">{children}</div>
      <div className="card-actions">
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft size={16} /> Voltar
          </Button>
        )}
        <Button onClick={onContinue} className="continue">
          Continuar <ArrowRight size={17} />
        </Button>
      </div>
    </section>
  )
}

function Choice({
  label,
  selected,
  onClick,
  icon: Icon,
}: {
  label: string
  selected: boolean
  onClick: () => void
  icon?: React.ElementType
}) {
  return (
    <button className={`choice ${selected ? 'selected' : ''}`} onClick={onClick}>
      {Icon && <Icon size={18} />}
      <span>{label}</span>
      {selected && (
        <span className="choice-check">
          <Check size={12} />
        </span>
      )}
    </button>
  )
}

export default function Page() {
  const router = useRouter()
  const [started, setStarted] = useState(false)
  const [step, setStep] = useState(0)
  const [clinic, setClinic] = useState('Clínica Charme & Bela')
  const [segment, setSegment] = useState('Estética')
  const [selectedServices, setSelectedServices] = useState([
    'Depilação a laser',
    'Limpeza de pele',
    'Design de sobrancelhas',
  ])
  const [rooms, setRooms] = useState(4)
  const [machines, setMachines] = useState(6)
  const [workers, setWorkers] = useState(8)
  const [selectedRoles, setSelectedRoles] = useState(['Esteticistas', 'Recepcionistas'])
  const [days, setDays] = useState(['Seg', 'Ter', 'Qua', 'Qui', 'Sex'])
  const [preferences, setPreferences] = useState({ whatsapp: true, reminders: true, system: false })
  const [copied, setCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const progress = Math.round((step / 6) * 100)
  const toggle = (item: string, list: string[], setter: (items: string[]) => void) =>
    setter(list.includes(item) ? list.filter((x) => x !== item) : [...list, item])
  const summary = useMemo(
    () => [
      clinic,
      segment,
      `${selectedServices.length} procedimentos cadastrados`,
      `${rooms} salas de atendimento`,
      `${machines} máquinas · 2 alugadas`,
      `${workers} funcionárias`,
    ],
    [clinic, segment, selectedServices.length, rooms, machines, workers],
  )

  const next = () => setStep((value) => Math.min(6, value + 1))
  const previous = () => setStep((value) => Math.max(0, value - 1))

  if (!started)
    return (
      <main className="landing">
        <div className="landing-glow" />
        <header className="landing-header">
          <Brand dark />
          <button className="login-link" onClick={() => setStarted(true)}>
            Já tenho uma conta <ArrowRight size={15} />
          </button>
        </header>
        <div className="landing-body">
          <div className="landing-copy">
            <span className="eyebrow">
              <Sparkles size={14} /> Gestão que cuida de você
            </span>
            <h1>
              Sua clínica,
              <br />
              <em>mais simples.</em>
            </h1>
            <p>Agende, organize, atenda e encante seus clientes em um só lugar.</p>
            <div className="landing-actions">
              <Button onClick={() => setStarted(true)}>
                Começar agora <ArrowRight size={18} />
              </Button>
              <button className="play-link" onClick={() => setStarted(true)}>
                <span>▶</span> Ver como funciona
              </button>
            </div>
            <div className="trust-line">
              <div className="avatar-stack">
                <i />
                <i />
                <i />
                <i />
              </div>
              <span>+2.000 clínicas já simplificaram sua rotina</span>
            </div>
          </div>
          <div className="hero-preview">
            <div className="preview-window">
              <div className="preview-top">
                <span className="dot pink" />
                <span className="dot" />
                <span className="dot" />
                <span className="preview-title">Visão geral</span>
                <span className="preview-date">Hoje, 15 de maio</span>
              </div>
              <div className="preview-welcome">
                <div>
                  <small>Bom dia, Marcos</small>
                  <h3>Como está sua clínica hoje?</h3>
                </div>
                <div className="preview-avatar">M</div>
              </div>
              <div className="preview-stats">
                <div>
                  <span>Receita do mês</span>
                  <strong>R$ 24.580</strong>
                  <b>+12,5%</b>
                </div>
                <div>
                  <span>Atendimentos</span>
                  <strong>148</strong>
                  <b>+8,2%</b>
                </div>
              </div>
              <div className="preview-chart">
                <div className="chart-label">
                  <span>Receita semanal</span>
                  <small>Últimos 7 dias</small>
                </div>
                <div className="bars">
                  {[35, 52, 42, 68, 55, 86, 73].map((height, index) => (
                    <i
                      style={{ height: `${height}%` }}
                      className={index === 5 ? 'active' : ''}
                      key={height}
                    />
                  ))}
                </div>
              </div>
              <div className="preview-agenda">
                <span>Próximos atendimentos</span>
                <div className="agenda-item">
                  <b>16:00</b>
                  <span>
                    Camila Santos<small>Limpeza de pele</small>
                  </span>
                  <i>CS</i>
                </div>
                <div className="agenda-item">
                  <b>17:30</b>
                  <span>
                    Juliana Lima<small>Massagem relaxante</small>
                  </span>
                  <i>JL</i>
                </div>
              </div>
            </div>
            <div className="floating-note">
              <Bell size={17} />
              <span>
                <b>Você tem 3 lembretes</b>
                <small>para hoje</small>
              </span>
            </div>
          </div>
        </div>
        <footer className="landing-footer">
          <span>
            <Check size={15} /> Sem cartão de crédito
          </span>
          <span>
            <Check size={15} /> Configuração em 5 minutos
          </span>
          <span>
            <Check size={15} /> Suporte de verdade
          </span>
        </footer>
      </main>
    )

  return (
    <main className="onboarding">
      <div className="background-orb orb-one" />
      <div className="background-orb orb-two" />
      <header className="onboarding-header">
        <Brand dark />
        <div className="header-right">
          <span className="save-status">
            <Check size={14} /> Salvo automaticamente
          </span>
          <button className="exit-button" onClick={() => setStarted(false)}>
            Sair do onboarding <X size={16} />
          </button>
          <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)}>
            <Menu size={19} />
          </button>
        </div>
      </header>
      {menuOpen && (
        <div className="mobile-menu">
          <button onClick={() => setStarted(false)}>Sair do onboarding</button>
        </div>
      )}
      <div className="onboarding-layout">
        <aside className="progress-sidebar">
          <div className="progress-intro">
            <span className="eyebrow">
              <Sparkles size={13} /> Boas-vindas
            </span>
            <h1>
              Vamos configurar
              <br />
              <em>sua clínica.</em>
            </h1>
            <p>
              Responda algumas perguntas rápidas para personalizarmos sua experiência e deixarmos
              tudo pronto para você.
            </p>
          </div>
          <div className="progress-card">
            <div className="progress-title">
              <b>Seu progresso</b>
              <strong>{Math.max(5, progress)}% concluído</strong>
            </div>
            <div className="progress-track">
              <i style={{ width: `${Math.max(5, progress)}%` }} />
            </div>
            <ol>
              {steps.map((item, index) => (
                <li
                  className={index === step ? 'current' : index < step ? 'done' : ''}
                  key={item.title}
                >
                  <span>{index < step ? <Check size={13} /> : index + 1}</span>
                  <b>{item.title}</b>
                </li>
              ))}
            </ol>
          </div>
          <div className="help-card">
            <CircleHelp size={21} />
            <span>
              <b>Precisa de ajuda?</b>
              <small>Fale com nosso suporte</small>
            </span>
            <ArrowRight size={17} />
          </div>
        </aside>
        <div className="mobile-progress">
          <div>
            <span>Etapa {step + 1} de 7</span>
            <b>{steps[step].title}</b>
          </div>
          <div className="mobile-track">
            <i style={{ width: `${Math.max(5, progress)}%` }} />
          </div>
        </div>
        <div className="steps-area">
          {step === 0 && (
            <StepCard
              number={1}
              title="Sobre sua clínica"
              description="Vamos conhecer melhor o seu espaço."
              icon={Building2}
              onContinue={next}
            >
              <Field label="Nome da clínica" value={clinic} icon={Building2} onChange={setClinic} />
              <label className="field">
                <span>Segmento principal</span>
                <div className="field-control">
                  <Stethoscope size={17} />
                  <select value={segment} onChange={(e) => setSegment(e.target.value)}>
                    <option>Estética</option>
                    <option>Salão de beleza</option>
                    <option>Clínica médica</option>
                  </select>
                  <ChevronDown size={16} />
                </div>
              </label>
              <Field label="Data de fundação" value="15/06/2020" icon={CalendarDays} />
            </StepCard>
          )}
          {step === 1 && (
            <StepCard
              number={2}
              title="Serviços e procedimentos"
              description="Quais serviços sua clínica oferece?"
              icon={Sparkles}
              onContinue={next}
              onBack={previous}
            >
              <p className="input-label">Principais procedimentos</p>
              <div className="choice-grid">
                {services.map((item) => (
                  <Choice
                    key={item}
                    label={item}
                    selected={selectedServices.includes(item)}
                    onClick={() => toggle(item, selectedServices, setSelectedServices)}
                    icon={item === 'Outros' ? MoreHorizontal : HeartPulse}
                  />
                ))}
              </div>
              <p className="hint">Você poderá adicionar mais serviços depois.</p>
            </StepCard>
          )}
          {step === 2 && (
            <StepCard
              number={3}
              title="Estrutura da clínica"
              description="Conte-nos sobre os recursos do seu espaço."
              icon={Home}
              onContinue={next}
              onBack={previous}
            >
              <p className="input-label">Salas de atendimento</p>
              <div className="choice-row">
                {['1 a 3', '4 a 6', '7 a 10', '10+'].map((item) => (
                  <Choice key={item} label={item} selected={item === '4 a 6'} onClick={() => {}} />
                ))}
              </div>
              <Counter
                label="Possui máquinas/equipamentos?"
                value={machines}
                setValue={setMachines}
              />
              <Counter label="Salas em funcionamento" value={rooms} setValue={setRooms} />
            </StepCard>
          )}
          {step === 3 && (
            <StepCard
              number={4}
              title="Equipe"
              description="Quantas pessoas fazem parte da sua clínica?"
              icon={Users}
              onContinue={next}
              onBack={previous}
            >
              <Counter label="Número de funcionárias" value={workers} setValue={setWorkers} />
              <p className="input-label">Funções principais</p>
              <div className="choice-grid compact">
                {roles.map((item) => (
                  <Choice
                    key={item}
                    label={item}
                    selected={selectedRoles.includes(item)}
                    onClick={() => toggle(item, selectedRoles, setSelectedRoles)}
                  />
                ))}
              </div>
            </StepCard>
          )}
          {step === 4 && (
            <StepCard
              number={5}
              title="Funcionamento"
              description="Defina os horários para sua equipe e clientes."
              icon={CalendarDays}
              onContinue={next}
              onBack={previous}
            >
              <p className="input-label">Dias de atendimento</p>
              <div className="choice-row days">
                {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((item) => (
                  <Choice
                    key={item}
                    label={item}
                    selected={days.includes(item)}
                    onClick={() => toggle(item, days, setDays)}
                  />
                ))}
              </div>
              <div className="time-row">
                <Field label="Abertura" value="08:00" />
                <Field label="Fechamento" value="19:00" />
              </div>
              <div className="notice">
                <Bell size={17} />
                <span>
                  <b>Agenda inteligente</b>
                  <small>Você poderá ajustar horários por profissional depois.</small>
                </span>
              </div>
            </StepCard>
          )}
          {step === 5 && (
            <StepCard
              number={6}
              title="Preferências e integrações"
              description="Como podemos tornar sua rotina ainda melhor?"
              icon={Settings2}
              onContinue={next}
              onBack={previous}
            >
              <Toggle
                label="Você já usa algum sistema?"
                value={preferences.system}
                onClick={() => setPreferences({ ...preferences, system: !preferences.system })}
              />
              <Toggle
                label="Deseja integração com WhatsApp?"
                value={preferences.whatsapp}
                onClick={() => setPreferences({ ...preferences, whatsapp: !preferences.whatsapp })}
              />
              <Toggle
                label="Receber lembretes automáticos para clientes?"
                value={preferences.reminders}
                onClick={() =>
                  setPreferences({ ...preferences, reminders: !preferences.reminders })
                }
              />
              <div className="integration-row">
                <CreditCard size={18} />
                <span>
                  <b>Pagamentos online</b>
                  <small>Configure o Stripe depois, no seu painel.</small>
                </span>
                <span className="soon">Em breve</span>
              </div>
            </StepCard>
          )}
          {step === 6 && (
            <StepCard
              number={7}
              title="Tudo pronto!"
              description="Confira o resumo das informações."
              icon={Check}
              onContinue={() => router.push('/dashboard')}
              onBack={previous}
            >
              <div className="success-banner">
                <Gem size={21} />
                <span>
                  <b>Clínica criada com sucesso</b>
                  <small>Seu espaço está pronto para começar.</small>
                </span>
              </div>
              <div className="summary-list">
                {summary.map((item, index) => (
                  <div key={item}>
                    <span>
                      {[Building2, Stethoscope, ClipboardList, Home, Settings2, Users][index] &&
                        (() => {
                          const I = [Building2, Stethoscope, ClipboardList, Home, Settings2, Users][
                            index
                          ]
                          return <I size={17} />
                        })()}
                    </span>
                    {item}
                  </div>
                ))}
              </div>
              <div className="invite-box">
                <div>
                  <small>Link de convite para sua equipe</small>
                  <b>luminix.app/convite/charmebela</b>
                </div>
                <button onClick={() => setCopied(true)} aria-label="Copiar link">
                  {copied ? <Check size={17} /> : <Copy size={17} />}
                </button>
              </div>
              {copied && (
                <p className="copied-message">
                  <Check size={14} /> Link copiado. Agora é só compartilhar!
                </p>
              )}
            </StepCard>
          )}
        </div>
      </div>
      <footer className="onboarding-footer">
        <span>© 2024 Luminix · Feito para clínicas que cuidam</span>
        <span>
          <LockKeyhole size={14} /> Seus dados estão seguros
        </span>
      </footer>
    </main>
  )
}

function Counter({
  label,
  value,
  setValue,
}: {
  label: string
  value: number
  setValue: (value: number) => void
}) {
  return (
    <div className="counter">
      <span>{label}</span>
      <div>
        <button onClick={() => setValue(Math.max(1, value - 1))}>
          <span>−</span>
        </button>
        <b>{value}</b>
        <button onClick={() => setValue(value + 1)}>
          <Plus size={17} />
        </button>
      </div>
    </div>
  )
}
function Toggle({ label, value, onClick }: { label: string; value: boolean; onClick: () => void }) {
  return (
    <div className="toggle-row">
      <span>{label}</span>
      <div>
        <button className={value ? 'on' : ''} onClick={onClick}>
          {value ? 'Sim' : 'Não'}
        </button>
        <button className={!value ? 'on' : ''} onClick={onClick}>
          {value ? 'Não' : 'Sim'}
        </button>
      </div>
    </div>
  )
}
