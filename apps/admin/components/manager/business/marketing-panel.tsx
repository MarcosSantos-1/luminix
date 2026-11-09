'use client'

import { Button } from '@heroui/react'
import {
  BadgePercent,
  Cake,
  Check,
  Copy,
  ExternalLink,
  Globe,
  HeartHandshake,
  MessageCircle,
  Send,
} from 'lucide-react'
import { useState } from 'react'
import { publicSiteUrl } from '@/lib/public-site'
import { useClinicApi, useClinicResource } from '../settings/clinic-api'
import { LoadError, SettingsCard, SettingsSkeleton, StatusPill } from '../settings/settings-kit'
import { dateBr, whatsapp } from './format'
import { promotionState } from './services-panel'
import './business.css'

type Person = { id: string; name: string; phone: string | null }
type Marketing = {
  today: string
  site: { slug: string; published: boolean }
  birthdays: (Person & { day: number })[]
  inactive: (Person & { lastVisit: string | null })[]
}
type Catalog = {
  today: string
  promotions: {
    id: string
    name: string
    percent: number
    startsOn: string
    endsOn: string | null
    status: 'active' | 'paused' | 'archived'
    showOnSite: boolean
    serviceIds: string[]
  }[]
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
}: {
  clinicId: string
  clinicName: string
  onOpen: (label: string) => void
}) {
  const api = useClinicApi(clinicId)
  const marketing = useClinicResource<Marketing>(api, 'marketing')
  const catalog = useClinicResource<Catalog>(api, 'catalog')
  const [copied, setCopied] = useState(false)
  if (marketing.error && !marketing.data)
    return <LoadError message={marketing.error} onRetry={marketing.reload} />
  if (!marketing.data) return <SettingsSkeleton cards={3} />
  const data = marketing.data
  const url = publicSiteUrl(data.site.slug)
  const promotions = (catalog.data?.promotions ?? []).filter((item) =>
    ['Ativa', 'Agendada'].includes(promotionState(item, catalog.data!.today).label),
  )
  const shareText = `Conheça o ${clinicName}! Veja nossos serviços e horários: ${url}`

  return (
    <div className="biz-stack">
      <SettingsCard
        icon={<Globe size={20} />}
        title="Divulgue seu site"
        description="Coloque o link na bio do Instagram e mande para as clientes."
        badge={
          <StatusPill tone={data.site.published ? 'on' : 'off'}>
            {data.site.published ? 'No ar' : 'Fora do ar'}
          </StatusPill>
        }
      >
        <div className="site-link-row">
          <span className="site-link">
            <Globe size={16} aria-hidden />
            <span>{url.replace(/^https?:\/\//, '')}</span>
          </span>
          <Button
            size="sm"
            variant="secondary"
            onPress={() =>
              void navigator.clipboard?.writeText(url).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              })
            }
          >
            {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}{' '}
            {copied ? 'Copiado!' : 'Copiar link'}
          </Button>
          <a
            className="biz-whatsapp"
            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Send size={15} aria-hidden /> Compartilhar no WhatsApp
          </a>
          {data.site.published ? (
            <a className="site-open" href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={15} aria-hidden /> Ver site
            </a>
          ) : null}
        </div>
      </SettingsCard>

      <div className="biz-columns">
        <SettingsCard
          icon={<BadgePercent size={20} />}
          title="Promoções"
          description="Descontos que aparecem no site com o preço riscado."
          badge={
            <Button size="sm" variant="secondary" onPress={() => onOpen('Serviços')}>
              Gerenciar em Serviços
            </Button>
          }
        >
          {promotions.length ? (
            <ul className="biz-list is-compact">
              {promotions.map((item) => {
                const state = promotionState(item, catalog.data!.today)
                const promoText = `${item.name}: ${item.percent}% de desconto${item.endsOn ? ` até ${dateBr(item.endsOn)}` : ''} no ${clinicName}! Agende: ${url}`
                return (
                  <li key={item.id}>
                    <div className="biz-row-main">
                      <strong>
                        {item.name} · -{item.percent}%
                      </strong>
                      <span className="biz-row-meta">
                        {item.serviceIds.length} serviços ·{' '}
                        {item.endsOn ? `até ${dateBr(item.endsOn)}` : 'sem data para acabar'}
                      </span>
                    </div>
                    <div className="biz-actions">
                      <StatusPill tone={state.tone}>{state.label}</StatusPill>
                      <a
                        className="biz-whatsapp"
                        href={`https://wa.me/?text=${encodeURIComponent(promoText)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Send size={15} aria-hidden /> Divulgar
                      </a>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="settings-muted">
              Nenhuma promoção ativa. Crie uma em Serviços → Promoções.
            </p>
          )}
        </SettingsCard>

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
                return last ? `Última visita em ${dateBr(last)}` : 'Ainda não veio desde o cadastro'
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
    </div>
  )
}
