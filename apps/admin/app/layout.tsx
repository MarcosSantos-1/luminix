import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { StaffProvider } from '@/components/staff-provider'

export const metadata: Metadata = {
  title: 'Luminix — Sua clínica, mais simples',
  description: 'Configure sua clínica e simplifique sua rotina com o Luminix.',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#ed1765',
  userScalable: true,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="bg-background">
      <body className="antialiased">
        <StaffProvider>{children}</StaffProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
