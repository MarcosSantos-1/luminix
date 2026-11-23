'use client'

import {
  BadgePercent,
  Cake,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Globe,
  HeartHandshake,
  Megaphone,
  MessageCircle,
  Pencil,
  Send,
} from 'lucide-react'
import { useState } from 'react'
import { useSearchFocus, type SearchFocus } from '../workspace/workspace-signals'
import { publicSiteUrl } from '@/lib/public-site'
import { useClinicApi, useClinicResource } from '../settings/clinic-api'
import { LoadError, SettingsCard, SettingsSkeleton, StatusPill } from '../settings/settings-kit'
import { dateBr, whatsapp } from './format'
import { promotionState, type Catalog } from './catalog-model'
import { MarketingStudio } from './marketing-studio'
import { PromotionsSection } from './promotions'
import './business.css'

type Person = { id: string; name: string; phone: string | null }
type Marketing = {
  today: string
  site: { slug: string; published: boolean }
  birthdays: (Person & { day: number })[]
  inactive: (Person & { lastVisit: string | null })[]
}
function first(name: string) {
  return name.trim().split(/\s+/)[0]
}

function ContactList({
  people,
  meta,
  message,
}: {
  people: Person[]
  meta: (person: Person) => string
  message: (person: Person) => string
}) {
  return (
    <ul className="biz-list is-compact">
      {people.map((person) => {
        const link = whatsapp(person.phone, message(person))
        return (
          <li key={person.id}>
            <div className="biz-row-main">
              <strong>{person.name}</strong>
              <span className="biz-row-meta">{meta(person)}</span>
            </div>
            <div className="biz-actions">
              {link ? (
                <a className="biz-whatsapp" href={link} target="_blank" rel="noopener noreferrer">
                  <MessageCircle size={15} aria-hidden /> Mandar mensagem
                </a>
              ) : (
                <small className="settings-muted">Sem WhatsApp</small>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function MarketingPanel({
  clinicId,
  clinicName,
  onOpen,
  focus,
}: {
  clinicId: string
  clinicName: string
  /** Opens another page (Vitrine e site). */
  onOpen?: (label: string) => void
  /** From Serviços → "Ver em Marketing": opens Promoções at that promotion. */
  focus?: SearchFocus | null
}) {
  const api = useClinicApi(clinicId)
  const marketing = useClinicResource<Marketing>(api, 'marketing')
  const catalog = useClinicResource<Catalog>(api, 'catalog')
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'marketing' | 'promotions'>(
    focus?.tab === 'promotions' ? 'promotions' : 'marketing',
  )
  const [highlight, setHighlight] = useState<string>()
  useSearchFocus(focus, (query) => {
    if (focus?.tab !== 'promotions') return
    setTab('promotions')
    setHighlight(query || undefined)
  })
  if (marketing.error && !marketing.data)
    return <LoadError message={marketing.error} onRetry={marketing.reload} />
  if (!marketing.data) return <SettingsSkeleton cards={3} />
  const data = marketing.data
  const url = publicSiteUrl(data.site.slug)
  const shareText = `Conheça o ${clinicName}! Veja nossos serviços e horários: ${url}`

  const live = (catalog.data?.promotions ?? []).filter(
    (item) => promotionState(item, catalog.data!.today).tone !== 'off',
  ).length

  return (
    <div className="biz-stack">
      <div className="svc-tabs mk-tabs" role="tablist" aria-label="Marketing">
        {(
          [
            ['marketing', <Megaphone key="m" size={18} />, 'Divulgação', null],
            ['promotions', <BadgePercent key="p" size={18} />, 'Promoções', live],
          ] as const
        ).map(([id, icon, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            <span className="svc-tab-icon" aria-hidden>
              {icon}
            </span>
            <span className="svc-tab-label">{label}</span>
            {count ? <em>{count}</em> : null}
          </button>
        ))}
      </div>

      {tab === 'promotions' ? (
        catalog.data ? (
          <PromotionsSection
            api={api}
            data={catalog.data}
            highlightId={highlight}
            onChanged={catalog.reload}
          />
        ) : (
          <SettingsSkeleton cards={1} />
        )
      ) : null}

      {tab === 'marketing' ? (
        <>
          <details className="mk-site">
            <summary>
              <span className="mk-site-icon" aria-hidden>
                <Globe size={20} />
              </span>
              <span className="mk-site-copy">
                <strong>Divulgue seu site</strong>
                <small>{url.replace(/^https?:\/\//, '')}</small>
              </span>
              <StatusPill tone={data.site.published ? 'on' : 'off'}>
                {data.site.published ? 'No ar' : 'Fora do ar'}
              </StatusPill>
              <ChevronDown className="mk-site-chevron" size={19} aria-hidden />
            </summary>
            <div className="mk-site-body">
              <p className="settings-muted">
                Coloque o link na bio do Instagram e mande para as clientes. Elas veem os serviços e
                agendam sozinhas.
              </p>
              <div className="mk-site-actions">
                <button
                  type="button"
                  className="mk-site-action is-main"
                  onClick={() =>
                    void navigator.clipboard?.writeText(url).then(() => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    })
                  }
                >
                  {copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
                  <span>{copied ? 'Copiado!' : 'Copiar link'}</span>
                </button>
                <a
                  className="mk-site-action is-whats"
                  href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Send size={18} aria-hidden />
                  <span>Enviar no WhatsApp</span>
                </a>
                {data.site.published ? (
                  <a
                    className="mk-site-action"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink size={18} aria-hidden />
                    <span>Ver site</span>
                  </a>
                ) : null}
                {onOpen ? (
                  <button
                    type="button"
                    className="mk-site-action"
                    onClick={() => onOpen('Vitrine e site')}
                  >
                    <Pencil size={18} aria-hidden />
                    <span>Editar site</span>
                  </button>
                ) : null}
              </div>
            </div>
          </details>

          <MarketingStudio
            api={api}
            clinicName={clinicName}
            services={(catalog.data?.services ?? [])
              .filter((service) => service.status === 'active')
              .sort((a, b) => b.bookings90d - a.bookings90d)
              .map((service) => service.name.toLocaleLowerCase('pt-BR'))}
          />

          <div className="biz-columns">
            <SettingsCard
              icon={<Cake size={20} />}
              title="Aniversariantes do mês"
              description="Um carinho no dia certo faz a cliente voltar."
              help={{
                title: 'Por que não aparece ninguém?',
                text: 'Só aparecem clientes com data de nascimento no cadastro. Você pode completar a data na ficha da cliente.',
              }}
              badge={<StatusPill tone="info">{data.birthdays.length}</StatusPill>}
            >
              {data.birthdays.length ? (
                <ContactList
                  people={data.birthdays}
                  meta={(person) =>
                    `Dia ${String((person as Person & { day: number }).day).padStart(2, '0')}`
                  }
                  message={(person) =>
                    `Feliz aniversário, ${first(person.name)}! 🎉 Todo o time do ${clinicName} deseja um dia lindo. Tem um mimo esperando por você aqui!`
                  }
                />
              ) : (
                <p className="settings-muted">
                  Ninguém faz aniversário este mês, ou as datas ainda não foram cadastradas.
                </p>
              )}
            </SettingsCard>

            <SettingsCard
              icon={<HeartHandshake size={20} />}
              title="Sentimos sua falta"
              description="Clientes que não vêm há mais de 60 dias. Uma mensagem simples costuma trazer de volta."
              badge={<StatusPill tone="info">{data.inactive.length}</StatusPill>}
            >
              {data.inactive.length ? (
                <ContactList
                  people={data.inactive}
                  meta={(person) => {
                    const last = (person as Person & { lastVisit: string | null }).lastVisit
                    return last
                      ? `Última visita em ${dateBr(last)}`
                      : 'Ainda não veio desde o cadastro'
                  }}
                  message={(person) =>
                    `Oi, ${first(person.name)}! Que saudade de você aqui no ${clinicName}. Que tal marcar um horário? ${url}`
                  }
                />
              ) : (
                <p className="settings-muted">
                  Todas as clientes vieram nos últimos 60 dias. Que ótimo!
                </p>
              )}
            </SettingsCard>
          </div>
          <p className="settings-footnote">
            Envio automático de mensagens e campanhas por e-mail: em preparação.
          </p>
        </>
      ) : null}
    </div>
  )
}
