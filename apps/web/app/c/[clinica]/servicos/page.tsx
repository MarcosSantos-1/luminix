import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { previewThemeOverride } from '../../../../lib/preview-clinic'
import { loadPublicClinic } from '../../../../lib/load-public-clinic'
import { clinicServicePhotos, clinicTheme, groupServices } from '../../../../lib/public-clinic'
import { ClinicServiceCard } from '../clinic-service-card'

export const metadata: Metadata = {
  title: 'Catálogo de serviços',
  robots: { index: false, follow: false },
}

export default async function ServiceCatalog({
  params,
  searchParams,
}: {
  params: Promise<{ clinica: string }>
  searchParams: Promise<{ tema?: string | string[] }>
}) {
  const { clinica } = await params
  const clinic = await loadPublicClinic(clinica)
  const theme = previewThemeOverride(clinica, (await searchParams).tema)
  const themeQuery = theme ? `?tema=${theme}` : ''
  if (!clinic) notFound()
  const groups = groupServices(clinic.services)
  const photos = clinicServicePhotos(clinic)
  return (
    <main className="clinic-site clinic-catalog" data-theme={theme ?? clinicTheme(clinic.theme)}>
      <header className="clinic-catalog-header">
        <Link href={`/c/${encodeURIComponent(clinica)}${themeQuery}#servicos`}>
          <ArrowLeft size={16} aria-hidden /> Voltar à vitrine
        </Link>
        <p>{clinic.name}</p>
        <h1>Catálogo de serviços</h1>
      </header>
      <div className="clinic-services">
        {groups.length ? (
          <>
            <nav className="clinic-categories" aria-label="Categorias de serviços">
              {groups.map(({ anchor, name, items }) => (
                <a key={anchor} href={`#${anchor}`}>
                  {name} <span>{items.length}</span>
                </a>
              ))}
            </nav>
            {groups.map((group, index) => (
              <section className="clinic-category" key={group.anchor} id={group.anchor}>
                <div className="clinic-category-heading">
                  <span className="clinic-category-number" aria-hidden>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h2>{group.name}</h2>
                  <p>{group.introduction}</p>
                </div>
                <div className="clinic-service-grid">
                  {group.items.map((service) => (
                    <ClinicServiceCard
                      key={service.id}
                      service={service}
                      photoUrl={photos.get(service.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </>
        ) : (
          <p className="clinic-empty">O catálogo está sendo preparado.</p>
        )}
        <p className="clinic-service-note">
          Confirme valores e disponibilidade com o estabelecimento.
        </p>
      </div>
    </main>
  )
}
