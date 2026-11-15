import Link from 'next/link'
import { Brand } from '../brand'
import { adminUrl } from '../../lib/admin-url'
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP_URL } from '../../lib/site'

export function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-top">
        <div className="lp-footer-brand">
          <Brand variant="white" />
          <p>Gestão para studios, salões, espaços e clínicas.</p>
        </div>
        <nav aria-label="Produto">
          <h2>Produto</h2>
          <Link href="/#o-que-e">O que é</Link>
          <Link href="/funcionalidades">Funcionalidades</Link>
          <Link href="/#como-comecar">Como começar</Link>
          <a href={adminUrl('/login')}>Entrar na gestão</a>
        </nav>
        <nav aria-label="Clientes">
          <h2>Sou cliente</h2>
          <Link href="/acesso">Acessar meu espaço</Link>
          <Link href="/c/demonstracao">Ver uma página de exemplo</Link>
        </nav>
        <nav aria-label="Ajuda">
          <h2>Ajuda</h2>
          <Link href="/#duvidas">Dúvidas frequentes</Link>
          <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </nav>
      </div>
      <div className="lp-footer-bottom">
        <span>© {new Date().getFullYear()} Luminix</span>
        <Link href="/termos">Termos de uso</Link>
        <Link href="/privacidade">Privacidade</Link>
      </div>
    </footer>
  )
}
