import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Acesso do cliente',
  robots: { index: false, follow: false },
}

export default function AcessoLayout({ children }: { children: ReactNode }) {
  return children
}
