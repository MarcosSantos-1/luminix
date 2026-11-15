import Link from 'next/link'
import { Menu } from 'lucide-react'
import { Brand } from '../brand'
import { adminUrl } from '../../lib/admin-url'
import { TRIAL_DAYS } from '../../lib/site'

const links = [
  { href: '/#o-que-e', label: 'O que é' },
  { href: '/#para-quem', label: 'Para quem' },
  { href: '/funcionalidades', label: 'Funcionalidades' },
  { href: '/#planos', label: 'Planos' },
  { href: '/#duvidas', label: 'Dúvidas' },
]

export function LandingHeader() {
  return (
    <header className="lp-header">
      <a className="lp-skip" href="#conteudo">
        Pular para o conteúdo
      </a>
      <div className="lp-header-bar">
        <Link href="/" className="lp-logo" aria-label="Luminix — início">
          <Brand />
        </Link>
        <nav className="lp-nav" aria-label="Navegação principal">
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="lp-header-actions">
          <a className="lp-login" href={adminUrl('/login')}>
            Entrar
          </a>
          <a className="lp-btn lp-btn-primary lp-btn-sm" href={adminUrl('/cadastro')}>
            Testar <span className="lp-only-wide">{TRIAL_DAYS} dias</span> grátis
          </a>
          <details className="lp-menu">
            <summary aria-label="Abrir menu">
              <Menu size={22} aria-hidden />
            </summary>
            <nav aria-label="Navegação mobile">
              {links.map((link) => (
                <Link key={link.href} href={link.href}>
                  {link.label}
                </Link>
              ))}
              <hr />
              <a href={adminUrl('/login')}>Entrar na gestão</a>
              <Link href="/acesso">Sou cliente de um espaço</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  )
}
