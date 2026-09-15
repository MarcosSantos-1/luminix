import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'

import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Luminix — Em preparação', template: '%s | Luminix' },
  description: 'Base do site e portal web do Luminix, em desenvolvimento.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            Luminix<span>beauty</span>
          </Link>
          <a href={process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://app.luminix.beauty'}>
            Acesso para gestores ↗
          </a>
        </header>
        <main>{children}</main>
        <footer>Ambiente de desenvolvimento · Sem dados reais de clínicas ou clientes.</footer>
      </body>
    </html>
  )
}
