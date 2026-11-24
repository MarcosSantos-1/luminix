import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ConfirmView } from './confirm-view'
import '../confirm.css'

// Confirmation link of one visit (ADR-038). The token in the URL is the credential: no index,
// no referrer (WhatsApp/maps links opened from here must not receive it).
export const metadata: Metadata = {
  title: 'Confirmar horário',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) notFound()
  // Read in the browser, straight from the API: each person counts against their own IP limit.
  return <ConfirmView token={token} />
}
