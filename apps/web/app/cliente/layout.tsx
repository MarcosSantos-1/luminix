import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { ClientRoot } from '../../components/client-app/shell'
import './cliente.css'

export const metadata: Metadata = {
  title: { default: 'Área do cliente', template: '%s | Luminix' },
  description: 'Agende, acompanhe seus horários e fale com o seu espaço.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function ClientLayout({ children }: { children: ReactNode }) {
  return <ClientRoot>{children}</ClientRoot>
}
