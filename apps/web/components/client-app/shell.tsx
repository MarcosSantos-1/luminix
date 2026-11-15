'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import {
  ArrowLeftRight,
  Bell,
  CalendarDays,
  History,
  House,
  LayoutGrid,
  Plus,
  UserRound,
} from 'lucide-react'
import {
  linkSpace,
  rememberPendingSpace,
  takePendingSpace,
  useClient,
} from '../../lib/client-app/store'
import { fetchSpace } from './use-clinic'
import { Avatar, SpaceLogo } from './ui'

/** Captures `?espaco=<slug>` (button on the clinic site) and links it once there is a session. */
export function ClientRoot({ children }: { children: ReactNode }) {
  const { ready, account } = useClient()
  const router = useRouter()
  const signedIn = Boolean(account)
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('espaco')
    if (slug) rememberPendingSpace(slug)
  }, [])
  useEffect(() => {
    if (!ready || !signedIn) return
    const slug = takePendingSpace()
    if (!slug) return
    void fetchSpace(slug).then((found) => {
      if (!found) return
      linkSpace(found.summary)
      router.replace('/cliente')
    })
  }, [ready, signedIn, router])
  return children
}

export function Splash() {
  return (
    <div className="ca ca-splash" data-theme="luminix" role="status" aria-label="Carregando">
      <span />
    </div>
  )
}

const tabs = [
  { href: '/cliente', label: 'Início', icon: House },
  { href: '/cliente/servicos', label: 'Serviços', icon: LayoutGrid },
  { href: '/cliente/agendar', label: 'Agendar', icon: Plus, primary: true },
  { href: '/cliente/agenda', label: 'Agenda', icon: CalendarDays },
  { href: '/cliente/perfil', label: 'Perfil', icon: UserRound },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, account, space } = useClient()
  const router = useRouter()
  const pathname = usePathname()
  const target = !ready
    ? null
    : !account
      ? '/cliente/entrar'
      : !space
        ? '/cliente/espacos'
        : !space.anamnesis
          ? '/cliente/anamnese'
          : null
  useEffect(() => {
    if (target) router.replace(target)
  }, [target, router])
  if (!ready || !account || !space || !space.anamnesis) return <Splash />

  const unread = space.notices.filter((item) => !item.read).length
  // Exact segment match: /cliente/agendar must not light up /cliente/agenda.
  const isActive = (href: string) =>
    pathname === href || (href !== '/cliente' && pathname.startsWith(`${href}/`))

  return (
    <div className="ca ca-app" data-theme={space.summary.theme}>
      <aside className="ca-side">
        <Link className="ca-side-space" href="/cliente/espacos" aria-label="Trocar de espaço">
          <SpaceLogo space={space.summary} size={42} />
          <span>
            <strong>{space.summary.name}</strong>
            <small>Trocar de espaço</small>
          </span>
          <ArrowLeftRight size={16} aria-hidden />
        </Link>
        <nav aria-label="Navegação principal">
          {tabs.map(({ href, label, icon: Icon, primary }) => (
            <Link
              key={href}
              href={href}
              className={primary ? 'ca-side-primary' : undefined}
              aria-current={isActive(href) ? 'page' : undefined}
            >
              <Icon size={19} aria-hidden /> {label}
            </Link>
          ))}
          <Link
            href="/cliente/historico"
            aria-current={isActive('/cliente/historico') ? 'page' : undefined}
          >
            <History size={19} aria-hidden /> Histórico
          </Link>
          <Link
            href="/cliente/notificacoes"
            aria-current={isActive('/cliente/notificacoes') ? 'page' : undefined}
          >
            <Bell size={19} aria-hidden /> Notificações
            {unread > 0 && <b>{unread}</b>}
          </Link>
        </nav>
        <Link className="ca-side-user" href="/cliente/perfil">
          <Avatar name={account.name} photo={space.anamnesis.photo} size={38} />
          <span>
            <strong>{account.name}</strong>
            <small>{account.email}</small>
          </span>
        </Link>
      </aside>
      <main className="ca-main" id="conteudo">
        {children}
      </main>
      <nav className="ca-tabs" aria-label="Navegação principal">
        {tabs.map(({ href, label, icon: Icon, primary }) => (
          <Link
            key={href}
            href={href}
            className={primary ? 'ca-tab-primary' : undefined}
            aria-current={isActive(href) ? 'page' : undefined}
            aria-label={label}
          >
            <Icon size={primary ? 22 : 20} aria-hidden />
            {!primary && <span>{label}</span>}
          </Link>
        ))}
      </nav>
    </div>
  )
}
