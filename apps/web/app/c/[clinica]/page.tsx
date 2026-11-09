import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPreviewClinic, previewThemeOverride } from '../../../lib/preview-clinic'
import { loadPublicClinic } from '../../../lib/load-public-clinic'
import { ClinicSiteView } from './clinic-site-view'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ clinica: string }>
}): Promise<Metadata> {
  const { clinica } = await params
  const clinic = await loadPublicClinic(clinica)
  return {
    title: clinic?.name ?? 'Espaço não encontrado',
    description: clinic
      ? `Conheça ${clinic.name}: serviços, informações e canais de contato do espaço.`
      : undefined,
    robots: { index: false, follow: false },
  }
}

export default async function ClinicPage({
  params,
  searchParams,
}: {
  params: Promise<{ clinica: string }>
  searchParams: Promise<{ tema?: string | string[] }>
}) {
  const { clinica } = await params
  const clinic = await loadPublicClinic(clinica)
  if (!clinic) notFound()
  const demo = Boolean(getPreviewClinic(clinica))
  const { tema } = await searchParams
  return (
    <ClinicSiteView
      clinic={clinic}
      demo={demo}
      previewTheme={previewThemeOverride(clinica, tema)}
    />
  )
}
