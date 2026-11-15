'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Bell,
  CalendarDays,
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
import { whatsappLink } from '../../../lib/public-clinic'
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
  return (
    <section className="ca-slider" aria-label="Destaques">
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
  const { account, space } = useClient()
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
            <Link href="/cliente/agenda" className="ca-round" aria-label="Ver na agenda">
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
                  <a
                    className="ca-chip-button"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${space.summary.name} ${address}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir no mapa <ArrowRight size={16} aria-hidden />
                  </a>
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
    { href: '/cliente/agendar', label: 'Agendar', icon: CalendarDays },
    { href: '/cliente/agenda', label: 'Meus horários', icon: Clock },
    { href: '/cliente/historico', label: 'Histórico', icon: History },
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
          <Link
            href="/cliente/notificacoes"
            className="ca-bell"
            aria-label={unread ? `Notificações, ${unread} não lidas` : 'Notificações'}
          >
            <Bell size={19} aria-hidden />
            {unread > 0 && <b>{unread > 9 ? '9+' : unread}</b>}
          </Link>
          <Link href="/cliente/perfil" aria-label="Seu perfil">
            <Avatar name={account.name} photo={space.anamnesis?.photo} size={42} />
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
            {actions.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}>
                <span>
                  <Icon size={20} aria-hidden />
                </span>
                {label}
              </Link>
            ))}
            {contact && (
              <a href={contact} target="_blank" rel="noopener noreferrer">
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
                    </small>
                  </span>
                  <StatusBadge appointment={item} />
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
          {services.slice(0, 6).map((service, position) => (
            <Link
              key={service.id}
              href={`/cliente/agendar?servico=${service.id}`}
              className="ca-rail-card"
              data-tone={position === 0 ? 'dark' : 'light'}
            >
              <small>{service.category}</small>
              <strong>{service.name}</strong>
              <span>
                {priceLabel(service)} · {durationLabel(service.durationMinutes)}
              </span>
              <i aria-hidden>
                <ArrowRight size={17} />
              </i>
            </Link>
          ))}
          {!clinic && <span className="ca-rail-card ca-skeleton" aria-hidden />}
        </div>
      </section>
    </div>
  )
}
