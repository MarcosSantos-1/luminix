import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Figtree, Outfit } from 'next/font/google'

import './globals.css'

const display = Outfit({ subsets: ['latin'], variable: '--font-display', display: 'swap' })
const body = Figtree({ subsets: ['latin'], variable: '--font-body', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Luminix — Sua clínica, mais simples', template: '%s | Luminix' },
  description: 'Agende, organize, atenda e encante seus clientes em um só lugar.',
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: '/brand/logo.png', type: 'image/png', sizes: '1254x1254' }],
    apple: [{ url: '/brand/logo.png', type: 'image/png', sizes: '1254x1254' }],
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  )
}
