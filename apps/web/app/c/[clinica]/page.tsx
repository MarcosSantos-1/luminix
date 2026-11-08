import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowDown,
  Clock3,
  Flower2,
  Globe,
  Camera,
  MapPin,
  MessageCircle,
  Sparkles,
} from 'lucide-react'
import { loadPublicClinic } from '../../../lib/load-public-clinic'
import { groupServices, publicLink, whatsappLink } from '../../../lib/public-clinic'

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

export default async function ClinicPage({ params }: { params: Promise<{ clinica: string }> }) {
  const { clinica } = await params
  const clinic = await loadPublicClinic(clinica)
  if (!clinic) notFound()
  const demo = clinica === 'demonstracao'
  const theme = ['rosa', 'grafite', 'violeta', 'dourado', 'esmeralda', 'azul'].includes(
    clinic.theme,
  )
    ? clinic.theme
    : 'rosa'
  const groups = groupServices(clinic.services)
  const contact = whatsappLink(clinic.whatsapp)
  const socials = (['instagram', 'facebook', 'website'] as const).flatMap((kind) => {
    const url = publicLink(clinic[kind], kind)
    return url
      ? [
          {
            url,
            label:
              kind === 'website'
                ? 'Site do espaço'
                : kind === 'instagram'
                  ? 'Instagram'
                  : 'Facebook',
          },
        ]
      : []
  })
  const channels = [
    ...(contact ? [{ url: contact, label: 'WhatsApp', icon: MessageCircle }] : []),
    ...socials.map((social) => ({
      ...social,
      icon: social.label === 'Instagram' ? Camera : Globe,
    })),
  ]
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
  const city = location ? [location.city, location.state].filter(Boolean).join(' · ') : ''
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
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
    <div className="clinic-site" data-theme={theme} id="topo">
      {demo && (
        <div className="clinic-demo">
          Página demonstrativa · Serviços e valores ilustrativos. Nenhum agendamento é realizado
          aqui.
        </div>
      )}
      <main>
        <section
          className={`clinic-cover${demo ? ' clinic-cover-demo' : ''}`}
          aria-labelledby="clinic-title"
        >
          <header className="clinic-header">
            <a className="clinic-wordmark" href="#topo" aria-label="Voltar ao início">
              <Sparkles size={20} aria-hidden />
              <span>Luminix</span>
            </a>
            <nav aria-label="Navegação do espaço">
              <a href="#servicos">Serviços</a>
              <a href="#visita">Informações</a>
            </nav>
          </header>
          <div className="clinic-hero">
            <div className="clinic-hero-art" aria-hidden="true">
              {demo ? (
                <Image
                  className="clinic-portrait"
                  src="/clinic/demo-portrait.webp"
                  alt=""
                  fill
                  sizes="(max-width: 700px) 66vw, 600px"
                  preload
                  unoptimized
                />
              ) : (
                <div className="clinic-seal">
                  {clinic.logoUrl ? (
                    <Image src={clinic.logoUrl} alt="" width={144} height={144} unoptimized />
                  ) : (
                    <span className="clinic-monogram">
                      {clinic.name.trim().slice(0, 1).toLocaleUpperCase('pt-BR')}
                    </span>
                  )}
                  <Sparkles size={22} />
                </div>
              )}
            </div>
            <div className="clinic-hero-copy">
              <span className="clinic-kicker">
                <Sparkles size={14} aria-hidden /> Seu espaço de beleza e bem-estar
              </span>
              <h1 id="clinic-title">{clinic.name}</h1>
              <p>Cuidados para o seu estilo, no seu tempo.</p>
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
                <a className="clinic-button" href="#servicos">
                  Ver serviços <ArrowDown size={16} aria-hidden />
                </a>
                {channels.map(({ url, label, icon: Icon }) => (
                  <a
                    className="clinic-contact"
                    key={label}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon size={17} aria-hidden /> {label}
                  </a>
                ))}
              </div>
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
          <div className="clinic-section-heading">
            <span className="clinic-kicker">MENU DE SERVIÇOS</span>
            <h2 id="service-title">Escolha seu próximo cuidado.</h2>
            <p>
              Explore as categorias e converse com a equipe para conhecer os detalhes do
              atendimento.
            </p>
          </div>
          {groups.length > 0 ? (
            <>
              <nav className="clinic-categories" aria-label="Categorias de serviços">
                {groups.map((group) => (
                  <a key={group.anchor} href={`#${group.anchor}`}>
                    {group.name}
                    <span>{group.items.length}</span>
                  </a>
                ))}
              </nav>
              {groups.map((group, index) => (
                <section className="clinic-category" key={group.anchor} id={group.anchor}>
                  <div className="clinic-category-heading">
                    <span className="clinic-category-number" aria-hidden>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h3>{group.name}</h3>
                    <p>{group.introduction}</p>
                  </div>
                  <div className="clinic-service-grid">
                    {group.items.map((service) => (
                      <article className="clinic-service" key={service.id}>
                        <div className="clinic-service-mark" aria-hidden>
                          <Flower2 size={26} strokeWidth={1.35} />
                        </div>
                        <div className="clinic-service-copy">
                          <h4>{service.name}</h4>
                          {service.description && <p>{service.description}</p>}
                          <div className="clinic-service-meta">
                            <span>
                              <Clock3 size={14} aria-hidden />
                              {service.durationMinutes} min
                            </span>
                            <strong>
                              {service.priceType === 'quote'
                                ? 'Sob consulta'
                                : `${service.priceType === 'from' ? 'A partir de ' : ''}${money.format(service.priceCents / 100)}`}
                            </strong>
                          </div>
                          {service.bookingMode === 'manual_release' && (
                            <small>Disponibilidade sob consulta com a equipe.</small>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </>
          ) : (
            <p className="clinic-empty">
              O catálogo está sendo preparado. Consulte o espaço para conhecer os atendimentos.
            </p>
          )}
          <p className="clinic-service-note">
            Valores e disponibilidade devem ser confirmados com o estabelecimento. Esta página não
            realiza reservas nem pagamentos.
          </p>
        </section>
        <section className="clinic-visit" id="visita" aria-labelledby="visit-title">
          <div className="clinic-section-heading">
            <span className="clinic-kicker">VAMOS NOS ENCONTRAR</span>
            <h2 id="visit-title">Conheça nosso espaço.</h2>
            <p>As informações para planejar seu próximo momento de cuidado.</p>
          </div>
          <div className="clinic-visit-grid">
            <section>
              <MapPin size={24} aria-hidden />
              <h3>Onde estamos</h3>
              {address ? (
                <>
                  <p>{address}</p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ver localização no mapa ↗
                  </a>
                </>
              ) : (
                <p>Entre em contato com o espaço para combinar a localização do atendimento.</p>
              )}
            </section>
            {clinic.hours.length > 0 && (
              <section>
                <Clock3 size={24} aria-hidden />
                <h3>Horários do espaço</h3>
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
                <small>Horários especiais e disponibilidade devem ser confirmados.</small>
              </section>
            )}
            {(contact || socials.length > 0) && (
              <section>
                <MessageCircle size={24} aria-hidden />
                <h3>Vamos conversar?</h3>
                <p>Tire dúvidas sobre serviços e horários diretamente com a equipe.</p>
                <div className="clinic-socials">
                  {contact && (
                    <a href={contact} target="_blank" rel="noopener noreferrer">
                      WhatsApp ↗
                    </a>
                  )}
                  {socials.map((social) => (
                    <a
                      href={social.url}
                      key={social.label}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {social.label} ↗
                    </a>
                  ))}
                </div>
              </section>
            )}
          </div>
        </section>
      </main>
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
