import Link from 'next/link'
import { ArrowUpRight, Menu } from 'lucide-react'
import { Brand } from '../brand'
import { adminUrl } from '../../lib/admin-url'

export function SiteHeader() {
  return (
    <header className="marketing-header">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <Link href="/" className="marketing-logo" aria-label="Luminix — início">
        <Brand />
      </Link>
      <nav className="desktop-nav" aria-label="Navegação principal">
        <Link href="/#para-seu-espaco">Para seu espaço</Link>
        <Link href="/#para-clientes">Sou cliente</Link>
        <Link href="/#duvidas">Dúvidas</Link>
      </nav>
      <a className="marketing-login" href={adminUrl('/login')}>
        Entrar na gestão <ArrowUpRight size={16} aria-hidden />
      </a>
      <details className="mobile-menu">
        <summary aria-label="Abrir menu de navegação">
          <Menu size={22} aria-hidden />
          <span>Menu</span>
        </summary>
        <nav aria-label="Navegação mobile">
          <Link href="/#para-seu-espaco">Conhecer o Luminix</Link>
          <Link href="/acesso">Sou cliente de um espaço</Link>
          <Link href="/#duvidas">Dúvidas frequentes</Link>
          <a href={adminUrl('/login')}>Entrar na gestão</a>
        </nav>
      </details>
    </header>
  )
}
