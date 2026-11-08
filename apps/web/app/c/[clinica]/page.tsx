import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowUpRight,
  CalendarDays,
  Clock3,
  MapPin,
  Map as MapIcon,
  UserRound,
  Sparkles,
} from 'lucide-react'
import { Brand } from '../../../components/brand'
import {
  clinicCategories,
  dominantClinicCategory,
  type ClinicCategory,
} from '../../../lib/clinic-categories'
import { demoOptions, getPreviewClinic, previewThemeOverride } from '../../../lib/preview-clinic'
import { ClinicDemoDebugger } from './clinic-demo-debugger'
import { ClinicMiniMap, ClinicSpaceCode } from './clinic-interactions'
import { ClinicGalleryGrid } from './clinic-gallery-grid'
import { ClinicServiceCard } from './clinic-service-card'
import { loadPublicClinic } from '../../../lib/load-public-clinic'
import {
  clinicServicePhotos,
  clinicTheme,
  publicLink,
  showcaseServices,
  whatsappLink,
} from '../../../lib/public-clinic'

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
  const previewTheme = previewThemeOverride(clinica, tema)
  const theme = previewTheme ?? clinicTheme(clinic.theme)
  const themeQuery = previewTheme ? `?tema=${previewTheme}` : ''
  const category =
    clinic.heroCategory === undefined
      ? clinic.style === 'hair-salon'
        ? 'cabelo'
        : dominantClinicCategory(clinic.services)
      : clinic.heroCategory
  const hero =
    category && Object.hasOwn(clinicCategories, category)
      ? clinicCategories[category as ClinicCategory].hero
      : null
  const style =
    clinic.style === 'standard'
      ? 'standard'
      : clinic.style === 'hair-salon' || category === 'cabelo'
        ? 'hair-salon'
        : 'classic'
  const gallery = clinic.gallery ?? []
  const featured = showcaseServices(clinic)
  const servicePhotos = clinicServicePhotos(clinic)
  const contact = whatsappLink(clinic.whatsapp)
  const socials = (
    [
      ['instagram', 'Instagram'],
      ['facebook', 'Facebook'],
      ['website', 'Website'],
    ] as const
  ).flatMap(([kind, label]) => {
    const url = publicLink(clinic[kind], kind)
    return url ? [{ kind, label, url }] : []
  })
  const location = clinic.location
  const address = location
    ? [
        location.line,
        location.number,
        location.district,
        location.city,
        location.state,
        location.postalCode,
      ]
        .filter(Boolean)
        .join(', ')
    : ''
  const mapAddress = demo ? 'Praça da Sé, São Paulo, SP' : address
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapAddress)}`
  // Migration 0011 assigns the lowercased public code as the clinic's slug.
  const spaceCode = demo
    ? 'DEMO'
    : /^[a-z]{2}-[0-9]{4}$/.test(clinic.slug)
      ? clinic.slug.toUpperCase()
      : null
  const evaluationUrl = contact
    ? `${contact}?text=${encodeURIComponent('Olá! Gostaria de agendar uma avaliação.')}`
    : null
  const city = location ? [location.city, location.state].filter(Boolean).join(' · ') : ''
  const days = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
  ]
  return (
    <div
      className="clinic-site"
      data-theme={theme}
      data-style={style}
      data-category={category ?? undefined}
      id="topo"
    >
      {demo && (
        <div className="clinic-demo">
          Página demonstrativa · Serviços e valores ilustrativos. Nenhum agendamento é realizado
          aqui.{socials.length > 0 && ' Links sociais de exemplo.'}
        </div>
      )}
      <main>
        <section
          className={`clinic-cover${hero ? ' clinic-cover-has-portrait' : ''}`}
          aria-labelledby="clinic-title"
        >
          <header className="clinic-header">
            <a className="clinic-wordmark" href="#topo" aria-label="Voltar ao início">
              <Brand variant="white" />
            </a>
            <nav aria-label="Navegação do espaço">
              <a href="#servicos">Serviços</a>
              <a href="#visita">Informações</a>
              {gallery.length > 0 && <a href="#galeria">Galeria</a>}
            </nav>
          </header>
          <div className="clinic-hero">
            <div className="clinic-hero-art" aria-hidden="true">
              {hero ? (
                <Image
                  className="clinic-portrait"
                  src={hero}
                  alt=""
                  fill
                  sizes="(max-width: 700px) 66vw, 600px"
                  preload
                  unoptimized
                />
              ) : (
                <div className="clinic-seal">
                  <span className="clinic-monogram">
                    {clinic.name.trim().slice(0, 1).toLocaleUpperCase('pt-BR')}
                  </span>
                  <Sparkles size={22} />
                </div>
              )}
            </div>
            <div className="clinic-hero-copy">
              <div className="clinic-hero-identity" aria-hidden="true">
                {clinic.logoUrl ? (
                  <Image src={clinic.logoUrl} alt="" width={72} height={72} unoptimized />
                ) : (
                  <span>{clinic.name.trim().slice(0, 1).toLocaleUpperCase('pt-BR')}</span>
                )}
              </div>
              <h1 id="clinic-title">{clinic.name}</h1>
              {clinic.subtitle && <p>{clinic.subtitle}</p>}
              {(city || clinic.foundedYear) && (
                <div className="clinic-cover-details">
                  {city && (
                    <span>
                      <MapPin size={15} aria-hidden />
                      {city}
                    </span>
                  )}
                  {clinic.foundedYear && <span>Desde {clinic.foundedYear}</span>}
                </div>
              )}
              <div className="clinic-actions">
                <a
                  className="clinic-button"
                  href={evaluationUrl ?? '#visita'}
                  target={evaluationUrl ? '_blank' : undefined}
                  rel={evaluationUrl ? 'noopener noreferrer' : undefined}
                >
                  <CalendarDays size={17} aria-hidden />
                  {evaluationUrl ? 'Agendar avaliação' : 'Consultar atendimento'}
                </a>
                <Link
                  className="clinic-contact"
                  href={`/c/${encodeURIComponent(clinic.slug)}/meu-plano`}
                >
                  <UserRound size={17} aria-hidden /> Acessar Meu Espaço
                </Link>
              </div>
              {socials.length > 0 && (
                <nav className="clinic-social-links" aria-label="Redes sociais e site do espaço">
                  {socials.map(({ kind, label, url }) => (
                    <a
                      key={kind}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      title={label}
                    >
                      <Image
                        src={`/clinic/social/${kind}.webp`}
                        alt=""
                        width={26}
                        height={26}
                        unoptimized
                      />
                    </a>
                  ))}
                </nav>
              )}
            </div>
          </div>
          <svg
            className="clinic-cover-wave"
            viewBox="0 0 1440 120"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M0 92C243 133 433 87 657 66C1007 33 1174 132 1440 20V120H0Z" />
            <path d="M0 108C279 136 451 76 714 82C1035 90 1150 135 1440 49V120H0Z" />
          </svg>
        </section>
        <section className="clinic-services" id="servicos" aria-labelledby="service-title">
          <div className="clinic-showcase-heading">
            <div className="clinic-section-heading">
              <span className="clinic-kicker">VITRINE DO ESPAÇO</span>
              <h2 id="service-title">Serviços em destaque</h2>
            </div>
            {featured.length > 0 && (
              <Link
                className="clinic-view-all"
                href={`/c/${encodeURIComponent(clinic.slug)}/servicos${themeQuery}`}
              >
                Ver todos <ArrowUpRight size={16} aria-hidden />
              </Link>
            )}
          </div>
          {featured.length ? (
            <div className="clinic-service-grid">
              {featured.map((service) => (
                <ClinicServiceCard
                  key={service.id}
                  service={service}
                  photoUrl={servicePhotos.get(service.id)}
                  showCategory
                />
              ))}
            </div>
          ) : (
            <p className="clinic-empty">O catálogo está sendo preparado.</p>
          )}
        </section>
        <section className="clinic-visit" id="visita" aria-labelledby="visit-title">
          <div className="clinic-location">
            {mapAddress && <ClinicMiniMap address={mapAddress} autoLoad={!demo} />}
            <div className="clinic-location-details">
              <h2 id="visit-title">
                <MapPin size={21} aria-hidden /> Localização
              </h2>
              {mapAddress ? (
                <address>{demo ? `Localização ilustrativa: ${mapAddress}` : address}</address>
              ) : (
                <p>Consulte o espaço para confirmar o endereço do atendimento.</p>
              )}
            </div>
            {mapAddress && (
              <a
                className="clinic-map-link"
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MapIcon size={17} aria-hidden /> Ver no Google Maps
              </a>
            )}
          </div>
          {clinic.hours.length > 0 && (
            <section className="clinic-opening-hours" aria-labelledby="hours-title">
              <h2 id="hours-title">
                <Clock3 size={20} aria-hidden /> Horários do espaço
              </h2>
              <dl className="clinic-hours">
                {clinic.hours.map((day) => (
                  <div key={day.weekday}>
                    <dt>{days[day.weekday]}</dt>
                    <dd>
                      {day.available && day.periods.length
                        ? day.periods.map((period) => `${period.start}–${period.end}`).join(' / ')
                        : 'Fechado'}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </section>
        {gallery.length > 0 && (
          <section className="clinic-gallery" id="galeria" aria-labelledby="gallery-title">
            <div className="clinic-showcase-heading">
              <div className="clinic-section-heading">
                <span className="clinic-kicker">PORTFÓLIO</span>
                <h2 id="gallery-title">Galeria</h2>
                <p>
                  {demo
                    ? 'Imagens ilustrativas da demonstração.'
                    : 'Veja o espaço e conheça de perto o trabalho da equipe.'}
                </p>
              </div>
              <Link
                className="clinic-view-all"
                href={`/c/${encodeURIComponent(clinic.slug)}/galeria${themeQuery}`}
              >
                Ver todas <ArrowUpRight size={16} aria-hidden />
              </Link>
            </div>
            <ClinicGalleryGrid photos={gallery.slice(0, 4)} name={clinic.name} />
          </section>
        )}
        <aside className="clinic-app-card" aria-labelledby="clinic-app-title">
          <div className="clinic-app-phone" aria-hidden="true">
            <Image src="/brand/logo-letter.png" alt="" width={72} height={24} />
          </div>
          <div className="clinic-app-copy">
            <h2 id="clinic-app-title">Baixe o app Luminix</h2>
            <p>
              Agende horários, acompanhe seus atendimentos, receba lembretes e gerencie seus
              pagamentos. Tudo no mesmo app.
            </p>
            <div className="clinic-app-stores" aria-label="Lojas de aplicativos">
              <button className="clinic-app-store" type="button" disabled>
                <Image src="/clinic/google-play.webp" alt="" width={26} height={26} unoptimized />
                <span>
                  <small>Em breve no</small>
                  <strong>Google Play</strong>
                </span>
              </button>
              <button className="clinic-app-store" type="button" disabled>
                <Image src="/clinic/app-store.webp" alt="" width={26} height={26} unoptimized />
                <span>
                  <small>Em breve na</small>
                  <strong>App Store</strong>
                </span>
              </button>
            </div>
            <a href="https://luminix-client.vercel.app" target="_blank" rel="noopener noreferrer">
              Abrir prévia web <ArrowUpRight size={15} aria-hidden />
            </a>
          </div>
          {spaceCode && <ClinicSpaceCode code={spaceCode} />}
        </aside>
      </main>
      {demo && <ClinicDemoDebugger slug={clinic.slug} theme={theme} options={demoOptions} />}
      <footer className="clinic-footer">
        <span>{clinic.name}</span>
        <p>
          Uma experiência com <Link href="/">Luminix</Link>
        </p>
        <nav aria-label="Informações">
          <Link href="/acesso">Orientações para clientes</Link>
          <Link href="/termos">Termos</Link>
          <Link href="/privacidade">Privacidade</Link>
        </nav>
      </footer>
    </div>
  )
}
