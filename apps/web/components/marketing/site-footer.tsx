import Link from 'next/link'
import { Brand } from '../brand'
import { adminUrl } from '../../lib/admin-url'

export function SiteFooter() {
  return (
    <footer className="marketing-footer">
      <div className="footer-top">
        <div className="footer-brand">
          <Link href="/" aria-label="Luminix — início">
            <Brand />
          </Link>
          <p>
            Mais espaço para cuidar.
            <br />
            Mais leveza para gerir.
          </p>
        </div>
        <nav aria-label="Para profissionais">
          <h2>Para seu espaço</h2>
          <a href={adminUrl('/cadastro')}>Criar minha conta</a>
          <a href={adminUrl('/login')}>Entrar na gestão</a>
          <Link href="/#como-comecar">Como começar</Link>
        </nav>
        <nav aria-label="Para clientes">
          <h2>Para você, cliente</h2>
          <Link href="/acesso">Orientações de acesso</Link>
          <Link href="/c/demonstracao">Conhecer a demonstração</Link>
          <Link href="/#duvidas">Dúvidas frequentes</Link>
        </nav>
        <nav aria-label="Informações legais">
          <h2>Transparência</h2>
          <Link href="/termos">Termos de uso</Link>
          <Link href="/privacidade">Política de privacidade</Link>
        </nav>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} Luminix</span>
        <span>Em preparação, com cuidado em cada detalhe.</span>
        <a href="#topo">Voltar ao topo ↑</a>
      </div>
    </footer>
  )
}
