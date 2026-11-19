import { notFound } from 'next/navigation'
import QAFirstAccess from './qa-client'

/** Development-only visual fixture for the invited person's first access. No API access. */
export default async function QAFirstAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>
}) {
  if (process.env.NODE_ENV !== 'development') notFound()
  const { step } = await searchParams
  return <QAFirstAccess step={step === 'photo' || step === 'welcome' ? step : 'password'} />
}
