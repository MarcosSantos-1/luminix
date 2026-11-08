import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getPreviewClinic, previewThemeOverride } from '../../../../lib/preview-clinic'
import { loadPublicClinic } from '../../../../lib/load-public-clinic'
import { clinicTheme } from '../../../../lib/public-clinic'
import { ClinicGalleryGrid } from '../clinic-gallery-grid'

export const metadata: Metadata = { title: 'Galeria', robots: { index: false, follow: false } }

export default async function ClinicGalleryPage({
  params,
  searchParams,
}: {
  searchParams: Promise<{ tema?: string | string[] }>
  params: Promise<{ clinica: string }>
}) {
  const { clinica } = await params
  const clinic = await loadPublicClinic(clinica)
  const theme = previewThemeOverride(clinica, (await searchParams).tema)
  const themeQuery = theme ? `?tema=${theme}` : ''
  if (!clinic?.gallery?.length) notFound()

  return (
    <main className="clinic-site clinic-catalog" data-theme={theme ?? clinicTheme(clinic.theme)}>
      <header className="clinic-catalog-header">
        <Link href={`/c/${encodeURIComponent(clinic.slug)}${themeQuery}#galeria`}>
          <ArrowLeft size={16} aria-hidden /> Voltar à vitrine
        </Link>
        <p>{clinic.name}</p>
        <h1>Galeria</h1>
      </header>
      <section className="clinic-gallery clinic-gallery-full" aria-label="Todas as fotos">
        {getPreviewClinic(clinica) && <p>Imagens ilustrativas da demonstração.</p>}
        <ClinicGalleryGrid photos={clinic.gallery} name={clinic.name} />
      </section>
    </main>
  )
}
