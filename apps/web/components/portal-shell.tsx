import Link from 'next/link'
import type { ReactNode } from 'react'

export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div className="portal">
      <header className="site-header">
        <Link href="/" className="portal-brand">
          Luminix<span>beauty</span>
        </Link>
        <Link href="/acesso">Área do cliente</Link>
      </header>
      <div className="portal-main">{children}</div>
      <footer>Ambiente de desenvolvimento · Sem dados reais de clínicas ou clientes.</footer>
    </div>
  )
}
