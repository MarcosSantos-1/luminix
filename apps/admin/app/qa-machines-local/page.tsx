import { notFound } from 'next/navigation'
import QA from './qa-client'

export default async function QAMachinesPage({
  searchParams,
}: {
  searchParams: Promise<{ embedded?: string; view?: string }>
}) {
  if (process.env.NODE_ENV !== 'development') notFound()
  const params = await searchParams
  return <QA embedded={params.embedded === '1'} initialView={params.view} />
}
