'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarClock,
  Clock,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  X,
} from 'lucide-react'
import { useClient } from '../../../../lib/client-app/store'
import {
  durationLabel,
  effectivePrice,
  formatMoney,
  priceLabel,
} from '../../../../lib/client-app/format'
import { clinicServicePhotos, type PublicService } from '../../../../lib/public-clinic'
import { serviceCategoryArt } from '../../../../lib/clinic-categories'
import { useClinic } from '../../../../components/client-app/use-clinic'
import {
  Empty,
  PageHeader,
  ServiceFlags,
  Sheet,
  depositOf,
} from '../../../../components/client-app/ui'

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

const sorts = {
  relevance: 'Ordem do espaço',
  price: 'Menor preço',
  duration: 'Mais rápidos',
  name: 'A–Z',
} as const
type Sort = keyof typeof sorts

export default function ServicesPage() {
  const { space } = useClient()
  const { clinic, status } = useClinic(space?.summary.slug ?? null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState<Sort>('relevance')
  const [onlyPromo, setOnlyPromo] = useState(false)
  const [filters, setFilters] = useState(false)
  const [detail, setDetail] = useState<PublicService | null>(null)

  // The home search field lands here with ?q=.
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('q')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL after hydration
    if (initial) setQuery(initial)
  }, [])

  const services = useMemo(() => clinic?.services ?? [], [clinic])
  const photos = useMemo(() => (clinic ? clinicServicePhotos(clinic) : new Map()), [clinic])
  const categories = useMemo(() => [...new Set(services.map((item) => item.category))], [services])
  const visible = useMemo(() => {
    const term = fold(query.trim())
    const list = services.filter(
      (item) =>
        (!category || item.category === category) &&
        (!onlyPromo || item.promoPercent) &&
        (!term || fold(`${item.name} ${item.category} ${item.description ?? ''}`).includes(term)),
    )
    if (sort === 'price')
      // Quotes have no price to compare: keep them last.
      list.sort(
        (a, b) =>
          Number(a.priceType === 'quote') - Number(b.priceType === 'quote') ||
          effectivePrice(a) - effectivePrice(b),
      )
    if (sort === 'duration') list.sort((a, b) => a.durationMinutes - b.durationMinutes)
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    return list
  }, [services, query, category, sort, onlyPromo])

  const activeFilters = Number(sort !== 'relevance') + Number(onlyPromo)
  const art = (service: PublicService) => photos.get(service.id) ?? serviceCategoryArt(service)

  return (
    <div className="ca-page">
      <PageHeader title="Serviços" kicker={space?.summary.name} />
      <div className="ca-toolbar">
        <label className="ca-search">
          <Search size={18} aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome ou categoria"
            aria-label="Buscar serviço"
          />
          {query && (
            <button type="button" aria-label="Limpar busca" onClick={() => setQuery('')}>
              <X size={16} aria-hidden />
            </button>
          )}
        </label>
        <button
          type="button"
          className="ca-filter-button"
          aria-label="Filtros e ordenação"
          onClick={() => setFilters(true)}
        >
          <SlidersHorizontal size={18} aria-hidden />
          {activeFilters > 0 && <b>{activeFilters}</b>}
        </button>
      </div>

      {categories.length > 1 && (
        <div className="ca-chips" role="group" aria-label="Categorias">
          <button type="button" aria-pressed={!category} onClick={() => setCategory('')}>
            Todos
          </button>
          {categories.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={category === name}
              onClick={() => setCategory(category === name ? '' : name)}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {status === 'error' && (
        <Empty title="Não foi possível carregar os serviços">
          <p>Verifique sua conexão e tente de novo em instantes.</p>
        </Empty>
      )}
      {status === 'loading' && (
        <div className="ca-service-grid" aria-hidden>
          {[0, 1, 2, 3].map((item) => (
            <span key={item} className="ca-service ca-skeleton" />
          ))}
        </div>
      )}
      {status === 'ready' && visible.length === 0 && (
        <Empty title="Nenhum serviço encontrado">
          <p>Tente outro termo ou limpe os filtros.</p>
        </Empty>
      )}
      {status === 'ready' && visible.length > 0 && (
        <>
          <p className="ca-count">
            {visible.length} {visible.length === 1 ? 'serviço' : 'serviços'}
          </p>
          <ul className="ca-service-grid">
            {visible.map((service) => {
              const image = art(service)
              return (
                <li key={service.id}>
                  <button type="button" className="ca-service" onClick={() => setDetail(service)}>
                    <span className="ca-service-art">
                      {image ? (
                        <Image src={image} alt="" width={96} height={96} unoptimized />
                      ) : (
                        <span aria-hidden>{service.name.slice(0, 1)}</span>
                      )}
                    </span>
                    <span className="ca-service-body">
                      <small>{service.category}</small>
                      <strong>{service.name}</strong>
                      <span className="ca-service-meta">
                        <Clock size={13} aria-hidden /> {durationLabel(service.durationMinutes)}
                        {service.promoPercent ? (
                          <em>
                            <Tag size={12} aria-hidden /> -{service.promoPercent}%
                          </em>
                        ) : null}
                      </span>
                      <ServiceFlags service={service} policy={space?.policy ?? null} />
                      <b>{priceLabel(service)}</b>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {filters && (
        <Sheet title="Filtros e ordenação" onClose={() => setFilters(false)}>
          <fieldset className="ca-options">
            <legend>Ordenar por</legend>
            {(Object.keys(sorts) as Sort[]).map((key) => (
              <label key={key}>
                <input
                  type="radio"
                  name="sort"
                  checked={sort === key}
                  onChange={() => setSort(key)}
                />
                {sorts[key]}
              </label>
            ))}
          </fieldset>
          <label className="ca-check">
            <input
              type="checkbox"
              checked={onlyPromo}
              onChange={(event) => setOnlyPromo(event.target.checked)}
            />
            <span>Somente com promoção</span>
          </label>
          <button type="button" className="ca-button" onClick={() => setFilters(false)}>
            Ver {visible.length} {visible.length === 1 ? 'serviço' : 'serviços'}
          </button>
        </Sheet>
      )}

      {detail && (
        <Sheet title={detail.name} onClose={() => setDetail(null)}>
          <div className="ca-detail">
            <small>{detail.category}</small>
            {detail.description && <p>{detail.description}</p>}
            <dl>
              <div>
                <dt>Duração</dt>
                <dd>{durationLabel(detail.durationMinutes)}</dd>
              </div>
              <div>
                <dt>Valor</dt>
                <dd>
                  {detail.promoPriceCents != null && detail.priceType !== 'quote' && (
                    <s>{formatMoney(detail.priceCents)}</s>
                  )}{' '}
                  {priceLabel(detail)}
                </dd>
              </div>
              <div>
                <dt>Reserva</dt>
                <dd>
                  {detail.bookingMode === 'manual_release'
                    ? 'Agenda especial'
                    : detail.bookingMode === 'instant'
                      ? 'Confirmação na hora'
                      : 'O espaço confirma'}
                </dd>
              </div>
              {depositOf(detail, space?.policy ?? null) ? (
                <div>
                  <dt>Sinal</dt>
                  <dd>{formatMoney(depositOf(detail, space?.policy ?? null)!)}</dd>
                </div>
              ) : null}
            </dl>
            {detail.bookingMode === 'manual_release' ? (
              <p className="ca-flag-note">
                <CalendarClock size={16} aria-hidden />
                Serviço com agenda específica: só pode ser marcado nos dias em que o espaço abre
                essa agenda
                {detail.rentalDates?.length
                  ? ` (${detail.rentalDates
                      .slice(0, 4)
                      .map((date) => date.slice(8, 10) + '/' + date.slice(5, 7))
                      .join(', ')}${detail.rentalDates.length > 4 ? '…' : ''})`
                  : ''}
                .
              </p>
            ) : null}
            {depositOf(detail, space?.policy ?? null) ? (
              <p className="ca-flag-note">
                <ShieldCheck size={16} aria-hidden />
                Para reservar, este serviço pede um sinal. O restante você paga no espaço, ou paga
                tudo de uma vez se preferir.
              </p>
            ) : null}
          </div>
          <Link className="ca-button" href={`/cliente/agendar?servico=${detail.id}`}>
            Escolher horário <ArrowRight size={18} aria-hidden />
          </Link>
        </Sheet>
      )}
    </div>
  )
}
