'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Bell,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  Clock,
  History,
  MapPin,
  MessageCircle,
  Search,
  Smartphone,
  Tag,
} from 'lucide-react'
import { useClient } from '../../../lib/client-app/store'
import {
  durationLabel,
  firstName,
  formatMoney,
  priceLabel,
  relativeDay,
  timeLabel,
} from '../../../lib/client-app/format'
import { clinicServicePhotos, whatsappLink } from '../../../lib/public-clinic'
import { serviceCategoryArt } from '../../../lib/clinic-categories'
import Image from 'next/image'
import { useClinic } from '../../../components/client-app/use-clinic'
import {
  Avatar,
  Lines,
  SpaceLogo,
  StatusBadge,
  displayStatus,
} from '../../../components/client-app/ui'

type Slide = { key: string; kind: 'next' | 'promo' | 'notice' | 'app'; node: React.ReactNode }

function Slider({ slides }: { slides: Slide[] }) {
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const element = track.current
    if (!element) return
    const onScroll = () =>
      setIndex(Math.round(element.scrollLeft / Math.max(1, element.clientWidth * 0.9)))
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => element.removeEventListener('scroll', onScroll)
  }, [])

  // Moves on by itself every few seconds (promotions and the space's cards live here). Pauses
  // while the person points at it, focuses it or prefers reduced motion; loops at the end.
  const paused = useRef(false)
  useEffect(() => {
    const element = track.current
    if (!element || slides.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => {
      if (paused.current || document.hidden) return
      const current = Math.round(element.scrollLeft / Math.max(1, element.clientWidth * 0.9))
      const target = element.children[(current + 1) % slides.length] as HTMLElement | undefined
      if (!target) return
      // Horizontal only: never pulls the page up or down.
      const left =
        target.getBoundingClientRect().left -
        element.getBoundingClientRect().left +
        element.scrollLeft -
        parseFloat(getComputedStyle(element).paddingLeft || '0')
      element.scrollTo({ left, behavior: 'smooth' })
    }, 5000)
    return () => clearInterval(timer)
  }, [slides.length])

  return (
    <section
      className="ca-slider"
      aria-label="Destaques"
      aria-roledescription="carrossel"
      onPointerEnter={() => (paused.current = true)}
      onPointerLeave={() => (paused.current = false)}
      onFocus={() => (paused.current = true)}
      onBlur={() => (paused.current = false)}
      onTouchStart={() => (paused.current = true)}
      onTouchEnd={() => setTimeout(() => (paused.current = false), 4000)}
    >
      <div className="ca-slider-track" ref={track}>
        {slides.map((slide) => (
          <article key={slide.key} className="ca-slide" data-kind={slide.kind}>
            {slide.kind !== 'notice' && <Lines />}
            {slide.node}
          </article>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="ca-dots">
          {slides.map((slide, position) => (
            <button
              key={slide.key}
              type="button"
              aria-label={`Destaque ${position + 1} de ${slides.length}`}
              aria-current={position === Math.min(index, slides.length - 1)}
              onClick={() =>
                track.current?.children[position]?.scrollIntoView({
                  behavior: 'smooth',
                  inline: 'start',
                  block: 'nearest',
                })
              }
            />
          ))}
        </div>
      )}
    </section>
  )
}

export default function HomePage() {
  const { account, space, anamnesis } = useClient()
  const { clinic } = useClinic(space?.summary.slug ?? null)
  if (!account || !space) return null

  const upcoming = space.appointments
    .filter((item) => ['confirmed', 'requested'].includes(displayStatus(item)))
    .sort((a, b) => a.start.localeCompare(b.start))
  const next = upcoming[0]
  const unread = space.notices.filter((item) => !item.read).length
  const services = clinic?.services ?? []
  const promos = services.filter((service) => service.promoPercent)
  const contact = whatsappLink(clinic?.whatsapp ?? null)
  const photos = clinic ? clinicServicePhotos(clinic) : new Map<string, string>()
  const address = [space.summary.address, space.summary.city].filter(Boolean).join(' · ')

  const slides: Slide[] = [
    {
      key: 'next',
      kind: 'next',
      node: next ? (
        <>
          <p className="ca-slide-kicker">Seu próximo horário</p>
          <h2>{next.serviceName}</h2>
          <p className="ca-slide-meta">
            <span>
              <CalendarDays size={15} aria-hidden /> {relativeDay(next.start)}
            </span>
            <span>
              <Clock size={15} aria-hidden /> {timeLabel(next.start)} ·{' '}
              {durationLabel(next.durationMinutes)}
            </span>
          </p>
          <div className="ca-slide-foot">
            <StatusBadge appointment={next} />
            <Link
              href={`/cliente/agenda?horario=${next.id}`}
              className="ca-round"
              aria-label="Ver na agenda"
            >
              <ArrowRight size={18} aria-hidden />
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="ca-slide-kicker">Nenhum horário marcado</p>
          <h2>Que tal reservar um tempo para você?</h2>
          <div className="ca-slide-foot">
            <Link href="/cliente/agendar" className="ca-chip-button">
              Agendar agora <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </>
      ),
    },
    ...promos.slice(0, 3).map((service): Slide => ({
      key: `promo-${service.id}`,
      kind: 'promo',
      node: (
        <>
          <p className="ca-slide-kicker">
            <Tag size={14} aria-hidden /> {service.promoPercent}% de desconto
          </p>
          <h2>{service.name}</h2>
          <p className="ca-slide-meta">
            {service.promoPriceCents != null && (
              <>
                <s>{formatMoney(service.priceCents)}</s> {formatMoney(service.promoPriceCents)}
              </>
            )}
          </p>
          <div className="ca-slide-foot">
            <Link href={`/cliente/agendar?servico=${service.id}`} className="ca-chip-button">
              Aproveitar <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </>
      ),
    })),
    ...(address
      ? [
          {
            key: 'notice',
            kind: 'notice',
            node: (
              <>
                <p className="ca-slide-kicker">
                  <MapPin size={14} aria-hidden /> Onde fica
                </p>
                <h2>{space.summary.name}</h2>
                <p className="ca-slide-meta">{address}</p>
                <div className="ca-slide-foot">
                  <Link className="ca-chip-button" href="/cliente/localizacao">
                    Ver localização <ArrowRight size={16} aria-hidden />
                  </Link>
                </div>
              </>
            ),
          } satisfies Slide,
        ]
      : []),
    {
      key: 'app',
      kind: 'app',
      node: (
        <>
          <p className="ca-slide-kicker">
            <Smartphone size={14} aria-hidden /> Luminix no celular
          </p>
          <h2>Deixe este espaço a um toque</h2>
          <p className="ca-slide-meta">
            No menu do navegador, escolha &ldquo;Adicionar à tela inicial&rdquo;. O app nas lojas
            chega em breve.
          </p>
        </>
      ),
    },
  ]

  const actions = [
    { href: '/cliente/agendar', label: 'Agendar', icon: CalendarPlus, tone: 'primary' },
    { href: '/cliente/agenda', label: 'Meus horários', icon: CalendarDays, tone: 'violet' },
    { href: '/cliente/historico', label: 'Histórico', icon: History, tone: 'amber' },
  ]

  return (
    <div className="ca-home">
      <header className="ca-hero">
        <Lines />
        <div className="ca-hero-top">
          <Link href="/cliente/espacos" className="ca-space-chip" aria-label="Trocar de espaço">
            <SpaceLogo space={space.summary} size={30} />
            <span>{space.summary.name}</span>
            <ChevronDown size={15} aria-hidden />
          </Link>
          {address || space.summary.mapQuery ? (
            <Link href="/cliente/localizacao" className="ca-hero-pill">
              <MapPin size={15} aria-hidden /> <span>Ver localização</span>
            </Link>
          ) : null}
          <Link
            href="/cliente/notificacoes"
            className="ca-bell"
            aria-label={unread ? `Notificações, ${unread} não lidas` : 'Notificações'}
          >
            <Bell size={19} aria-hidden />
            {unread > 0 && <b>{unread > 9 ? '9+' : unread}</b>}
          </Link>
          <Link href="/cliente/perfil" aria-label="Seu perfil">
            <Avatar name={account.name} photo={anamnesis?.photo} size={42} />
          </Link>
        </div>
        <p className="ca-hero-hello">Olá, {firstName(account.name)}</p>
        <h1>O que vamos cuidar hoje?</h1>
        <form className="ca-search" action="/cliente/servicos">
          <Search size={18} aria-hidden />
          <input name="q" placeholder="Buscar serviço" aria-label="Buscar serviço" />
        </form>
      </header>

      <div className="ca-home-grid">
        <div>
          <Slider slides={slides} />
          <nav className="ca-actions" aria-label="Atalhos">
            {actions.map(({ href, label, icon: Icon, tone }) => (
              <Link key={href} href={href} data-tone={tone}>
                <span>
                  <Icon size={20} aria-hidden />
                </span>
                {label}
              </Link>
            ))}
            {contact && (
              <a href={contact} target="_blank" rel="noopener noreferrer" data-tone="green">
                <span>
                  <MessageCircle size={20} aria-hidden />
                </span>
                Falar com o espaço
              </a>
            )}
          </nav>
        </div>

        <section className="ca-section">
          <header>
            <h2>Próximos horários</h2>
            <Link href="/cliente/agenda">Ver agenda</Link>
          </header>
          {upcoming.length ? (
            <ul className="ca-list">
              {upcoming.slice(0, 3).map((item) => (
                <li key={item.id}>
                  <Link href={`/cliente/agenda?horario=${item.id}`}>
                    <span className="ca-date-tile">
                      <b>{item.start.slice(8, 10)}</b>
                      {new Date(item.start)
                        .toLocaleDateString('pt-BR', { month: 'short' })
                        .replace('.', '')}
                    </span>
                    <span className="ca-list-text">
                      <strong>{item.serviceName}</strong>
                      <small>
                        {timeLabel(item.start)} · {durationLabel(item.durationMinutes)}
                        {item.presenceConfirmed ? '' : ' · confirme sua presença'}
                      </small>
                    </span>
                    <StatusBadge appointment={item} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ca-muted">Quando você marcar um horário, ele aparece aqui.</p>
          )}
        </section>
      </div>

      <section className="ca-section">
        <header>
          <h2>Serviços</h2>
          <Link href="/cliente/servicos">Ver todos</Link>
        </header>
        <div className="ca-rail">
          {services.slice(0, 6).map((service, position) => {
            const image = photos.get(service.id) ?? serviceCategoryArt(service)
            return (
              <Link
                key={service.id}
                href={`/cliente/agendar?servico=${service.id}`}
                className="ca-rail-card"
                data-tone={position === 0 ? 'dark' : 'light'}
              >
                <span className="ca-rail-art" aria-hidden>
                  {image ? (
                    <Image src={image} alt="" width={160} height={110} unoptimized />
                  ) : (
                    <b>{service.name.slice(0, 1)}</b>
                  )}
                  {service.promoPercent ? <em>-{service.promoPercent}%</em> : null}
                </span>
                <small>{service.category}</small>
                <strong>{service.name}</strong>
                <span>
                  {priceLabel(service)} · {durationLabel(service.durationMinutes)}
                </span>
                <i aria-hidden>
                  <ArrowRight size={17} />
                </i>
              </Link>
            )
          })}
          {!clinic && <span className="ca-rail-card ca-skeleton" aria-hidden />}
        </div>
      </section>
    </div>
  )
}
