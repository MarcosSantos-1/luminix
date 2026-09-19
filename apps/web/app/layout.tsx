import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Luminix — Sua clínica, mais simples', template: '%s | Luminix' },
  description: 'Agende, organize, atenda e encante seus clientes em um só lugar.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
