import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import { AppToastProvider } from '@/components/app-toast-provider'
import { StaffProvider } from '@/components/staff-provider'
import { spaceThemeBootScript } from '@/lib/space-theme'

export const metadata: Metadata = {
  title: 'Luminix — Sua clínica, mais simples',
  description: 'Configure sua clínica e simplifique sua rotina com o Luminix.',
  generator: 'v0.app',
  icons: {
    icon: [{ url: '/brand/logo.png', type: 'image/png', sizes: '1254x1254' }],
    apple: [{ url: '/brand/logo.png', type: 'image/png', sizes: '1254x1254' }],
  },
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
        <Script id="luminix-space-theme" strategy="beforeInteractive">
          {spaceThemeBootScript}
        </Script>
        <StaffProvider>
          {children}
          <AppToastProvider />
        </StaffProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
