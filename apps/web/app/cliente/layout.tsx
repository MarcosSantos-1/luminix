import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { ClientRoot } from '../../components/client-app/shell'
import './cliente.css'
import './cliente-polish.css'
import './cliente-pages.css'
import './cliente-booking.css'

export const metadata: Metadata = {
  title: { default: 'Área do cliente', template: '%s | Luminix' },
  description: 'Agende, acompanhe seus horários e fale com o seu espaço.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Safari's bars take the page's background instead of white or the site's pink.
  themeColor: '#f3f3f6',
}

export default function ClientLayout({ children }: { children: ReactNode }) {
  return <ClientRoot>{children}</ClientRoot>
}
