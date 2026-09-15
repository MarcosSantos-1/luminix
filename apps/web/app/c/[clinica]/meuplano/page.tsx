import { permanentRedirect, notFound } from 'next/navigation'

import { getPreviewClinic } from '../../../../lib/preview-clinic'

export default async function PlanAlias({ params }: { params: Promise<{ clinica: string }> }) {
  const { clinica } = await params
  const clinic = getPreviewClinic(clinica)
  if (!clinic) notFound()
  permanentRedirect(`/c/${clinic.slug}/meu-plano`)
}
