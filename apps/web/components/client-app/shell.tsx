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
import { rememberPendingSpace, useClient } from '../../lib/client-app/store'
import { Avatar, SpaceLogo } from './ui'

/**
 * Remembers `?espaco=<slug>` (button on the clinic site). Nothing is linked silently: the space
 * picker opens that space for confirmation once the visitor has a session and a record.
 */
export function ClientRoot({ children }: { children: ReactNode }) {
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('espaco')
    if (slug) rememberPendingSpace(slug)
  }, [])
  return children
}

export function Splash() {
  return (
    <div className="ca ca-splash" data-theme="luminix" role="status" aria-label="Carregando">
      <span />
    </div>
  )
}

const home = { href: '/cliente', label: 'Início', icon: House }
const services = { href: '/cliente/servicos', label: 'Serviços', icon: LayoutGrid }
const agenda = { href: '/cliente/agenda', label: 'Agenda', icon: CalendarDays }
const history = { href: '/cliente/historico', label: 'Histórico', icon: History }
const profile = { href: '/cliente/perfil', label: 'Perfil', icon: UserRound }
// Phone bar: home sits in the middle, under the thumb.
const tabs: { href: string; label: string; icon: typeof House; primary?: boolean }[] = [
  history,
  services,
  { ...home, primary: true },
  agenda,
  profile,
]
const sideLinks = [home, services, agenda, history]

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, account, space, anamnesis } = useClient()
  const router = useRouter()
  const pathname = usePathname()
  const target = !ready
    ? null
    : !account
      ? '/cliente/entrar'
      : !account.anamnesis
        ? '/cliente/anamnese'
        : !space
          ? '/cliente/espacos'
          : !anamnesis
            ? '/cliente/anamnese'
            : null
  useEffect(() => {
    if (target) router.replace(target)
  }, [target, router])
  if (!ready || !account || !space || !anamnesis) return <Splash />

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
          <Link href="/cliente/agendar" className="ca-side-primary">
            <Plus size={19} aria-hidden /> Agendar
          </Link>
          {sideLinks.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? 'page' : undefined}>
              <Icon size={19} aria-hidden /> {label}
            </Link>
          ))}
          <Link
            href="/cliente/notificacoes"
            aria-current={isActive('/cliente/notificacoes') ? 'page' : undefined}
          >
            <Bell size={19} aria-hidden /> Notificações
            {unread > 0 && <b>{unread}</b>}
          </Link>
          <Link href={profile.href} aria-current={isActive(profile.href) ? 'page' : undefined}>
            <UserRound size={19} aria-hidden /> Perfil
          </Link>
        </nav>
        <Link className="ca-side-user" href="/cliente/perfil">
          <Avatar name={account.name} photo={anamnesis.photo} size={38} />
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
