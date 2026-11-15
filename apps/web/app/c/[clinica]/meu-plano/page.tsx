import { notFound, redirect } from 'next/navigation'
import { loadPublicClinic } from '../../../../lib/load-public-clinic'

// Entry from the clinic site: the client area links this space after sign-in.
export default async function ClientSpaceEntry({
  params,
}: {
  params: Promise<{ clinica: string }>
}) {
  const { clinica } = await params
  if (!(await loadPublicClinic(clinica))) notFound()
  redirect(`/cliente?espaco=${encodeURIComponent(clinica)}`)
}
