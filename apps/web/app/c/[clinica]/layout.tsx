import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { PortalShell } from '../../../components/portal-shell'
import { getPreviewClinic } from '../../../lib/preview-clinic'

export default async function ClinicLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ clinica: string }>
}) {
  const { clinica } = await params
  if (!getPreviewClinic(clinica)) notFound()
  return <PortalShell>{children}</PortalShell>
}
