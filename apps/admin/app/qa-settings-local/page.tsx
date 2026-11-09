import { notFound } from 'next/navigation'
import QASettings from './qa-client'

/** Development-only visual fixture for Configurações and the site editor. No API access. */
export default async function QASettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; tab?: string }>
}) {
  if (process.env.NODE_ENV !== 'development') notFound()
  const params = await searchParams
  return <QASettings view={params.view === 'editor' ? 'editor' : 'settings'} tab={params.tab} />
}
