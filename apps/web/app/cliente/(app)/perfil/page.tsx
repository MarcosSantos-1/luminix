'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowLeftRight,
  Bell,
  ChevronRight,
  ClipboardList,
  Globe,
  History,
  Info,
  KeyRound,
  LifeBuoy,
  LogOut,
  UserRound,
} from 'lucide-react'
import { changePassword, signOut, updateAccount, useClient } from '../../../../lib/client-app/store'
import { Avatar, Lines, Sheet, SpaceLogo } from '../../../../components/client-app/ui'

type Panel = 'data' | 'notify' | 'language' | 'password' | 'help' | 'about' | null

const languages = [
  { value: 'pt-BR', label: 'Português (Brasil)', ready: true },
  { value: 'en', label: 'English', ready: false },
  { value: 'es', label: 'Español', ready: false },
] as const

const faq = [
  [
    'Como marco um horário?',
    'Toque no botão + da barra inferior, escolha o serviço, o dia e o horário. Alguns serviços são confirmados na hora; outros, pelo espaço.',
  ],
  [
    'Posso remarcar ou cancelar?',
    'Sim. Abra a Agenda, toque no horário e escolha Remarcar ou Cancelar. As regras de prazo são definidas por cada espaço.',
  ],
  [
    'Frequento mais de um espaço. Preciso de outra conta?',
    'Não. A mesma conta Luminix serve para todos. Use Trocar de espaço para alternar; ficha e histórico são separados.',
  ],
  [
    'Quem vê minha ficha de anamnese?',
    'Somente a equipe do espaço para o qual você respondeu. Outro espaço não tem acesso.',
  ],
] as const

function Row({
  icon,
  label,
  hint,
  onClick,
  href,
}: {
  icon: ReactNode
  label: string
  hint?: string
  onClick?: () => void
  href?: string
}) {
  const content = (
    <>
      <span className="ca-list-icon">{icon}</span>
      <span className="ca-list-text">
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <ChevronRight size={17} aria-hidden />
    </>
  )
  return (
    <li>
      {href ? (
        <Link href={href}>{content}</Link>
      ) : (
        <button type="button" onClick={onClick}>
          {content}
        </button>
      )}
    </li>
  )
}

export default function ProfilePage() {
  const router = useRouter()
  const { account, space, anamnesis } = useClient()
  const [panel, setPanel] = useState<Panel>(null)
  const [message, setMessage] = useState('')
  if (!account || !space || !anamnesis) return null
  const close = () => {
    setPanel(null)
    setMessage('')
  }

  async function saveData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    if (name.length < 2) return setMessage('Informe seu nome.')
    const failure = await updateAccount({ name, phone: String(data.get('phone') ?? '').trim() })
    if (failure) return setMessage(failure)
    close()
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const problem = await changePassword(String(data.get('current')), String(data.get('next')))
    if (problem) return setMessage(problem)
    form.reset()
    close()
  }

  const answered = new Date(anamnesis.answeredAt).toLocaleDateString('pt-BR')
  const spaceCount = Object.keys(account.spaces).length

  return (
    <div className="ca-page ca-profile">
      <header className="ca-profile-card">
        <Lines />
        <Avatar name={account.name} photo={anamnesis.photo} size={76} />
        <div>
          <h1>{account.name}</h1>
          <p>{account.email}</p>
          {account.phone && <p>{account.phone}</p>}
        </div>
      </header>

      <Link href="/cliente/espacos" className="ca-profile-space">
        <SpaceLogo space={space.summary} size={44} />
        <span className="ca-list-text">
          <strong>{space.summary.name}</strong>
          <small>
            {spaceCount === 1 ? 'Seu espaço atual' : `Espaço atual · ${spaceCount} vinculados`}
          </small>
        </span>
        <span className="ca-chip-button">
          <ArrowLeftRight size={15} aria-hidden /> Trocar
        </span>
      </Link>

      <div className="ca-profile-grid">
        <section>
          <h2>Conta</h2>
          <ul className="ca-list ca-menu">
            <Row
              icon={<UserRound size={18} />}
              label="Meus dados"
              hint="Nome e celular"
              onClick={() => setPanel('data')}
            />
            <Row
              icon={<ClipboardList size={18} />}
              label="Ficha de anamnese"
              hint={`${space.shareAnamnesis ? 'Ficha da conta' : 'Ficha só deste espaço'} · ${answered}`}
              href="/cliente/anamnese"
            />
            <Row
              icon={<History size={18} />}
              label="Histórico"
              hint="Atendimentos e pagamentos"
              href="/cliente/historico"
            />
            <Row
              icon={<KeyRound size={18} />}
              label="Acesso e senha"
              hint={account.email}
              onClick={() => setPanel('password')}
            />
          </ul>
        </section>
        <section>
          <h2>Preferências</h2>
          <ul className="ca-list ca-menu">
            <Row
              icon={<Bell size={18} />}
              label="Notificações"
              hint={account.notify.reminders ? 'Lembretes ativos' : 'Lembretes desativados'}
              onClick={() => setPanel('notify')}
            />
            <Row
              icon={<Globe size={18} />}
              label="Idioma"
              hint="Português (Brasil)"
              onClick={() => setPanel('language')}
            />
          </ul>
          <h2>Suporte</h2>
          <ul className="ca-list ca-menu">
            <Row
              icon={<LifeBuoy size={18} />}
              label="Ajuda"
              hint="Perguntas frequentes"
              onClick={() => setPanel('help')}
            />
            <Row
              icon={<Info size={18} />}
              label="Sobre o Luminix"
              hint="Versão, termos e privacidade"
              onClick={() => setPanel('about')}
            />
          </ul>
        </section>
      </div>

      <button
        type="button"
        className="ca-button ghost"
        onClick={() => {
          signOut()
          router.replace('/cliente/entrar')
        }}
      >
        <LogOut size={18} aria-hidden /> Sair da conta
      </button>

      {panel === 'data' && (
        <Sheet title="Meus dados" onClose={close}>
          <form className="ca-form" onSubmit={saveData}>
            <label>
              Nome completo
              <input name="name" defaultValue={account.name} autoComplete="name" />
            </label>
            <label>
              Celular
              <input name="phone" type="tel" defaultValue={account.phone} autoComplete="tel" />
            </label>
            <label>
              E-mail
              <input value={account.email} disabled readOnly />
              <small>O e-mail é o seu acesso e não pode ser alterado aqui.</small>
            </label>
            <p className="ca-error" role="alert">
              {message}
            </p>
            <button className="ca-button" type="submit">
              Salvar
            </button>
          </form>
        </Sheet>
      )}

      {panel === 'password' && (
        <Sheet title="Acesso e senha" onClose={close}>
          <form className="ca-form" onSubmit={savePassword}>
            <label>
              Senha atual
              <input name="current" type="password" autoComplete="current-password" required />
            </label>
            <label>
              Nova senha
              <input
                name="next"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
              <small>Pelo menos 8 caracteres.</small>
            </label>
            <p className="ca-error" role="alert">
              {message}
            </p>
            <button className="ca-button" type="submit">
              Alterar senha
            </button>
          </form>
        </Sheet>
      )}

      {panel === 'notify' && (
        <Sheet title="Notificações" onClose={close}>
          {(
            [
              ['reminders', 'Lembretes de horário', 'Confirmações, remarcações e avisos do dia.'],
              ['promotions', 'Promoções do espaço', 'Condições especiais e novidades.'],
            ] as const
          ).map(([key, label, hint]) => (
            <label key={key} className="ca-toggle">
              <span>
                <strong>{label}</strong>
                <small>{hint}</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={account.notify[key]}
                onChange={(event) =>
                  updateAccount({ notify: { ...account.notify, [key]: event.target.checked } })
                }
              />
            </label>
          ))}
          <p className="ca-note">
            Por enquanto os avisos aparecem dentro da área do cliente. Push e WhatsApp chegam com o
            aplicativo.
          </p>
        </Sheet>
      )}

      {panel === 'language' && (
        <Sheet title="Idioma" onClose={close}>
          <fieldset className="ca-options">
            <legend>Idioma da área do cliente</legend>
            {languages.map(({ value, label, ready }) => (
              <label key={value} data-disabled={!ready || undefined}>
                <input
                  type="radio"
                  name="language"
                  checked={account.language === value}
                  disabled={!ready}
                  onChange={() => updateAccount({ language: value })}
                />
                {label}
                {!ready && <small>Em breve</small>}
              </label>
            ))}
          </fieldset>
        </Sheet>
      )}

      {panel === 'help' && (
        <Sheet title="Ajuda" onClose={close}>
          <div className="ca-faq">
            {faq.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
          <p className="ca-note">
            Dúvidas sobre um atendimento, valores ou prazos: fale direto com {space.summary.name}.
          </p>
        </Sheet>
      )}

      {panel === 'about' && (
        <Sheet title="Sobre o Luminix" onClose={close}>
          <div className="ca-detail">
            <p>
              O Luminix conecta você aos espaços de beleza e bem-estar que frequenta: horários,
              histórico e avisos em uma conta só.
            </p>
            <dl>
              <div>
                <dt>Versão</dt>
                <dd>0.2</dd>
              </div>
              <div>
                <dt>Conta criada em</dt>
                <dd>{new Date(account.createdAt).toLocaleDateString('pt-BR')}</dd>
              </div>
            </dl>
          </div>
          <a className="ca-link" href="/termos" target="_blank" rel="noopener noreferrer">
            Termos de uso
          </a>
          <a className="ca-link" href="/privacidade" target="_blank" rel="noopener noreferrer">
            Política de privacidade
          </a>
        </Sheet>
      )}
    </div>
  )
}
