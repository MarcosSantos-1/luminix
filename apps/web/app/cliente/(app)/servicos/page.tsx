'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarClock,
  Clock,
  Gift,
  Layers,
  MessageCircle,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  X,
} from 'lucide-react'
import { loadPackages, useClient } from '../../../../lib/client-app/store'
import {
  durationLabel,
  effectivePrice,
  formatMoney,
  priceLabel,
} from '../../../../lib/client-app/format'
import type { SpacePackage } from '../../../../lib/client-app/types'
import {
  clinicServicePhotos,
  whatsappLink,
  type PublicService,
} from '../../../../lib/public-clinic'
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
/** The "Pacotes" chip: shows only packages. */
const PACKAGES = '\u0000pacotes'

/** Savings of a package against the same sessions one by one, in whole percent. */
function savings(item: SpacePackage) {
  return item.singleCents ? Math.round((1 - item.priceCents / item.singleCents) * 100) : 0
}

function PackageCard({
  item,
  index,
  onOpen,
}: {
  item: SpacePackage
  index: number
  onOpen: () => void
}) {
  const off = savings(item)
  return (
    <li style={{ '--i': index } as React.CSSProperties}>
      <button type="button" className="ca-package" onClick={onOpen}>
        <span className="ca-package-top">
          <span className="ca-package-icon" aria-hidden>
            {item.kind === 'combo' ? <Layers size={18} /> : <Gift size={18} />}
          </span>
          {off >= 1 ? <em>-{off}%</em> : null}
        </span>
        <small>
          {item.kind === 'combo' ? 'Combo' : 'Pacote'} · {item.sessions}{' '}
          {item.sessions === 1 ? 'sessão' : 'sessões'}
        </small>
        <strong>{item.name}</strong>
        <span className="ca-package-items">
          {item.items
            .map((part) => (item.kind === 'combo' ? `${part.sessions}× ${part.name}` : part.name))
            .join(' · ')}
        </span>
        <span className="ca-package-price">
          {item.singleCents ? <s>{formatMoney(item.singleCents)}</s> : null}
          <b>{formatMoney(item.priceCents)}</b>
          <small>{formatMoney(Math.round(item.priceCents / item.sessions))} por sessão</small>
        </span>
      </button>
    </li>
  )
}

export default function ServicesPage() {
  const { space } = useClient()
  const slug = space?.summary.slug ?? null
  const { clinic, status } = useClinic(slug)
  const [packages, setPackages] = useState<{ slug: string; list: SpacePackage[] } | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState<Sort>('relevance')
  const [onlyPromo, setOnlyPromo] = useState(false)
  const [filters, setFilters] = useState(false)
  const [detail, setDetail] = useState<PublicService | null>(null)
  const [pack, setPack] = useState<SpacePackage | null>(null)

  // The home search field lands here with ?q=; ?pacotes opens the packages.
  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    const initial = search.get('q')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL after hydration
    if (initial) setQuery(initial)
    if (search.has('pacotes')) setCategory(PACKAGES)
  }, [])

  useEffect(() => {
    if (!slug) return
    let active = true
    void loadPackages(slug).then((list) => {
      if (active) setPackages({ slug, list: list ?? [] })
    })
    return () => {
      active = false
    }
  }, [slug])

  const services = useMemo(() => clinic?.services ?? [], [clinic])
  const allPackages = useMemo(
    () => (packages && packages.slug === slug ? packages.list : []),
    [packages, slug],
  )
  const photos = useMemo(() => (clinic ? clinicServicePhotos(clinic) : new Map()), [clinic])
  const categories = useMemo(() => [...new Set(services.map((item) => item.category))], [services])
  const term = fold(query.trim())
  const visible = useMemo(() => {
    if (category === PACKAGES) return []
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
  }, [services, term, category, sort, onlyPromo])
  // Packages show with "Todos" and "Pacotes"; a category shows the ones that include it.
  const shownPackages = useMemo(
    () =>
      onlyPromo
        ? []
        : allPackages.filter(
            (item) =>
              (!category ||
                category === PACKAGES ||
                item.items.some(
                  (part) =>
                    services.find((service) => service.id === part.serviceId)?.category ===
                    category,
                )) &&
              (!term ||
                fold(`${item.name} ${item.items.map((part) => part.name).join(' ')}`).includes(
                  term,
                )),
          ),
    [allPackages, category, term, onlyPromo, services],
  )

  const activeFilters = Number(sort !== 'relevance') + Number(onlyPromo)
  const art = (service: PublicService) => photos.get(service.id) ?? serviceCategoryArt(service)
  const contact = whatsappLink(clinic?.whatsapp ?? null)
  const total = visible.length + shownPackages.length

  return (
    <div className="ca-page ca-services">
      <PageHeader title="Serviços" kicker={space?.summary.name} />
      <div className="ca-toolbar">
        <label className="ca-search">
          <Search size={18} aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar serviço ou pacote"
            aria-label="Buscar serviço ou pacote"
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

      {(categories.length > 1 || allPackages.length > 0) && (
        <div className="ca-chips" role="group" aria-label="Categorias">
          <button type="button" aria-pressed={!category} onClick={() => setCategory('')}>
            Todos
          </button>
          {allPackages.length > 0 && (
            <button
              type="button"
              className="ca-chip-special"
              aria-pressed={category === PACKAGES}
              onClick={() => setCategory(category === PACKAGES ? '' : PACKAGES)}
            >
              <Gift size={14} aria-hidden /> Pacotes
              <b>{allPackages.length}</b>
            </button>
          )}
          {categories.length > 1 &&
            categories.map((name) => (
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

      {status === 'ready' && shownPackages.length > 0 && (
        <section className="ca-section ca-packages" aria-label="Pacotes">
          <header>
            <h2>
              <Sparkles size={18} aria-hidden /> Pacotes
            </h2>
            <small>Mais sessões, melhor preço</small>
          </header>
          <ul className="ca-package-grid">
            {shownPackages.map((item, index) => (
              <PackageCard key={item.id} item={item} index={index} onOpen={() => setPack(item)} />
            ))}
          </ul>
        </section>
      )}

      {status === 'ready' && total === 0 && (
        <Empty title="Nada encontrado">
          <p>Tente outro termo ou limpe os filtros.</p>
        </Empty>
      )}
      {status === 'ready' && visible.length > 0 && (
        <section className="ca-section" aria-label="Serviços">
          {shownPackages.length > 0 && (
            <header>
              <h2>Serviços</h2>
            </header>
          )}
          <p className="ca-count">
            {visible.length} {visible.length === 1 ? 'serviço' : 'serviços'}
          </p>
          <ul className="ca-service-grid">
            {visible.map((service, index) => {
              const image = art(service)
              return (
                <li key={service.id} style={{ '--i': index } as React.CSSProperties}>
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
                    <span className="ca-service-go" aria-hidden>
                      <ArrowRight size={16} />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
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
          {allPackages.length > 0 && (
            <label className="ca-check">
              <input
                type="checkbox"
                checked={category === PACKAGES}
                onChange={(event) => setCategory(event.target.checked ? PACKAGES : '')}
              />
              <span>Somente pacotes</span>
            </label>
          )}
          <button type="button" className="ca-button" onClick={() => setFilters(false)}>
            Ver {total} {total === 1 ? 'resultado' : 'resultados'}
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
                <span>
                  Serviço com agenda específica: só pode ser marcado nos dias em que o espaço abre
                  essa agenda
                  {detail.rentalDates?.length
                    ? ` (${detail.rentalDates
                        .slice(0, 4)
                        .map((date) => date.slice(8, 10) + '/' + date.slice(5, 7))
                        .join(', ')}${detail.rentalDates.length > 4 ? '…' : ''})`
                    : ''}
                  .
                </span>
              </p>
            ) : null}
            {depositOf(detail, space?.policy ?? null) ? (
              <p className="ca-flag-note is-strong">
                <ShieldCheck size={16} aria-hidden />
                <span>
                  Para reservar, este serviço pede um sinal. O restante você paga no espaço, ou paga
                  tudo de uma vez se preferir.
                </span>
              </p>
            ) : null}
          </div>
          <Link className="ca-button" href={`/cliente/agendar?servico=${detail.id}`}>
            Escolher horário <ArrowRight size={18} aria-hidden />
          </Link>
        </Sheet>
      )}

      {pack && (
        <Sheet title={pack.name} onClose={() => setPack(null)}>
          <div className="ca-detail">
            <div className="ca-package-hero">
              <span className="ca-package-icon" aria-hidden>
                {pack.kind === 'combo' ? <Layers size={22} /> : <Gift size={22} />}
              </span>
              <span>
                <small>{pack.kind === 'combo' ? 'Combo de serviços' : 'Pacote de sessões'}</small>
                <strong>{formatMoney(pack.priceCents)}</strong>
                {pack.singleCents ? (
                  <em>
                    Economia de {formatMoney(pack.singleCents - pack.priceCents)} ({savings(pack)}%)
                  </em>
                ) : null}
              </span>
            </div>
            <ul className="ca-package-list">
              {pack.items.map((part) => (
                <li key={part.serviceId}>
                  <b>{part.sessions}×</b> {part.name}
                </li>
              ))}
            </ul>
            <dl>
              <div>
                <dt>Sessões</dt>
                <dd>{pack.sessions}</dd>
              </div>
              <div>
                <dt>Por sessão</dt>
                <dd>{formatMoney(Math.round(pack.priceCents / pack.sessions))}</dd>
              </div>
              <div>
                <dt>Validade</dt>
                <dd>
                  {pack.validityDays ? `${pack.validityDays} dias após a compra` : 'Sem prazo'}
                </dd>
              </div>
            </dl>
            <p className="ca-flag-note is-strong">
              <Gift size={16} aria-hidden />
              <span>
                O pacote é contratado com o espaço. Depois disso, cada sessão é agendada aqui pelo
                app, sem pagar de novo.
              </span>
            </p>
          </div>
          {contact ? (
            <a
              className="ca-button"
              href={`${contact}?text=${encodeURIComponent(`Olá! Tenho interesse no pacote "${pack.name}".`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={18} aria-hidden /> Quero este pacote
            </a>
          ) : (
            <p className="ca-note">Peça este pacote à equipe no seu próximo atendimento.</p>
          )}
          {pack.items[0] && (
            <Link
              className="ca-button ghost"
              href={`/cliente/agendar?servico=${pack.items[0].serviceId}`}
            >
              Agendar uma sessão avulsa
            </Link>
          )}
        </Sheet>
      )}
    </div>
  )
}
