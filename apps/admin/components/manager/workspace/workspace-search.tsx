'use client'

import { SearchField, Spinner } from '@heroui/react'
import {
  ArrowRight,
  BadgePercent,
  CalendarDays,
  FileText,
  Images,
  LayoutGrid,
  Package,
  Plus,
  Scissors,
  Settings,
  UserRound,
  UsersRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { managerSettingsSections, type ManagerSettingsSection } from '../manager-settings-nav'
import type { ClinicApi } from '../settings/clinic-api'
import {
  createShortcuts,
  fold,
  pageKeywords,
  score,
  settingsIndex,
  type IndexEntry,
} from './search-index'
import type { GoTarget } from './workspace-signals'
import './workspace.css'

type Hit = { id: string; title: string; detail: string }
type Groups = Partial<Record<keyof typeof remoteGroups, Hit[]>>

/** How each server group is shown and where a click takes you. */
const remoteGroups = {
  clients: {
    label: 'Clientes',
    icon: UserRound,
    to: (hit: Hit): GoTarget => ({ section: 'clientes', query: hit.title }),
  },
  services: {
    label: 'Serviços',
    icon: Scissors,
    to: (hit: Hit): GoTarget => ({ section: 'servicos', query: hit.title }),
  },
  promotions: {
    label: 'Promoções',
    icon: BadgePercent,
    to: (hit: Hit): GoTarget => ({ section: 'servicos', query: hit.title }),
  },
  appointments: {
    label: 'Agendamentos',
    icon: CalendarDays,
    to: (): GoTarget => ({ section: 'agenda' }),
  },
  professionals: {
    label: 'Equipe',
    icon: UsersRound,
    to: (hit: Hit): GoTarget => ({ section: 'configuracoes', tab: 'equipe', anchor: hit.title }),
  },
  inventory: {
    label: 'Estoque',
    icon: Package,
    to: (hit: Hit): GoTarget => ({ section: 'estoque', query: hit.title }),
  },
  finance: { label: 'Financeiro', icon: Wallet, to: (): GoTarget => ({ section: 'financeiro' }) },
  media: { label: 'Mídia', icon: Images, to: (): GoTarget => ({ section: 'midia' }) },
} satisfies Record<string, { label: string; icon: LucideIcon; to: (hit: Hit) => GoTarget }>

/** Which server groups matter most on each page ("Nesta página"). */
const sectionGroups: Record<string, (keyof typeof remoteGroups)[]> = {
  clientes: ['clients'],
  servicos: ['services', 'promotions'],
  agenda: ['appointments', 'clients'],
  estoque: ['inventory'],
  financeiro: ['finance'],
  midia: ['media'],
  marketing: ['promotions', 'clients'],
}

type Row = {
  key: string
  icon: LucideIcon
  title: string
  detail: string
  where?: string
  target: GoTarget
}
type Block = { key: string; label: string; rows: Row[] }

function Highlight({ text, needle }: { text: string; needle: string }): ReactNode {
  if (!needle) return text
  const index = fold(text).indexOf(needle)
  if (index < 0) return text
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </>
  )
}

export function WorkspaceSearch({
  api,
  query,
  onQueryChange,
  current,
  pages,
  settingsTabs,
  go,
}: {
  api?: ClinicApi
  query: string
  onQueryChange: (value: string) => void
  /** The page the person is on: its things come first. */
  current: { id: string; label: string; placeholder: string }
  pages: { id: string; label: string; subtitle?: string }[]
  settingsTabs?: ManagerSettingsSection[]
  go: (target: GoTarget) => void
}) {
  const needle = fold(query)
  const [remote, setRemote] = useState<{ q: string; groups: Groups } | null>(null)
  const [error, setError] = useState(false)
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (!api?.ready || needle.length < 2) return
    const timer = setTimeout(() => {
      void api
        .get<{ q: string; groups: Groups }>('search', { q: query.trim() })
        .then((data) => {
          setRemote({ q: needle, groups: data.groups })
          setError(false)
        })
        .catch(() => setError(true))
    }, 250)
    return () => clearTimeout(timer)
  }, [api, needle, query])

  const pageIds = useMemo(() => new Set(pages.map((page) => page.id)), [pages])
  const blocks = useMemo<Block[]>(() => {
    const local: (Row & { rank: number; section: string })[] = []
    for (const page of pages) {
      const entry = {
        title: page.label,
        detail: page.subtitle ?? '',
        keywords: pageKeywords[page.id],
      }
      const rank = score(entry, needle)
      if (rank)
        local.push({
          key: `page-${page.id}`,
          icon: LayoutGrid,
          title: page.label,
          detail: page.subtitle ?? 'Página do painel',
          where: 'Página',
          target: { section: page.id },
          rank,
          section: page.id,
        })
    }
    const allowedTabs = new Set(settingsTabs ?? managerSettingsSections.map((tab) => tab.id))
    if (pageIds.has('configuracoes')) {
      for (const tab of managerSettingsSections) {
        if (!allowedTabs.has(tab.id)) continue
        const rank = score({ title: tab.label, detail: 'Configurações' }, needle)
        if (rank)
          local.push({
            key: `tab-${tab.id}`,
            icon: Settings,
            title: tab.label,
            detail: 'Configurações',
            where: 'Configurações',
            target: { section: 'configuracoes', tab: tab.id },
            rank,
            section: 'configuracoes',
          })
      }
      if (needle)
        for (const entry of settingsIndex) {
          if (!entry.tab || !allowedTabs.has(entry.tab)) continue
          const rank = score(entry, needle)
          if (rank) local.push(toRow(entry, Settings, 'Configurações', rank))
        }
    }
    for (const entry of createShortcuts) {
      if (!pageIds.has(entry.section)) continue
      const rank = needle ? score(entry, needle) : entry.section === current.id ? 1 : 0
      if (rank) local.push(toRow(entry, Plus, 'Atalho', rank))
    }
    local.sort((a, b) => b.rank - a.rank)

    const fresh = remote && remote.q === needle ? remote.groups : null
    const remoteRows = (keys: (keyof typeof remoteGroups)[]) =>
      keys.flatMap((key) => {
        const config = remoteGroups[key]
        return (fresh?.[key] ?? []).map<Row>((hit) => ({
          key: `${key}-${hit.id}`,
          icon: config.icon,
          title: hit.title,
          detail: hit.detail,
          where: config.label,
          target: config.to(hit),
        }))
      })
    const contextKeys = sectionGroups[current.id] ?? []
    const otherKeys = (Object.keys(remoteGroups) as (keyof typeof remoteGroups)[]).filter(
      (key) => !contextKeys.includes(key),
    )
    const here = [
      ...remoteRows(contextKeys),
      ...local.filter(
        (row) =>
          row.section === current.id &&
          row.target.section === current.id &&
          row.key !== `page-${current.id}`,
      ),
    ]
    const hereKeys = new Set(here.map((row) => row.key))
    const result: Block[] = []
    if (here.length)
      result.push({ key: 'here', label: `Nesta página · ${current.label}`, rows: here })
    for (const key of otherKeys) {
      const rows = remoteRows([key])
      if (rows.length) result.push({ key, label: remoteGroups[key].label, rows })
    }
    const rest = local.filter((row) => !hereKeys.has(row.key))
    if (rest.length)
      result.push({
        key: 'nav',
        label: needle ? 'Páginas, ajustes e atalhos' : 'Ir para',
        rows: rest.slice(0, needle ? 12 : 16),
      })
    return result
  }, [pages, pageIds, settingsTabs, needle, remote, current.id, current.label])

  const flat = blocks.flatMap((block) => block.rows)
  const selected = Math.min(active, Math.max(flat.length - 1, 0))
  const waiting = Boolean(api?.ready) && needle.length >= 2 && remote?.q !== needle && !error

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      const next = (selected + step + flat.length) % Math.max(flat.length, 1)
      setActive(next)
      document.getElementById(`ws-hit-${next}`)?.scrollIntoView({ block: 'nearest' })
    } else if (event.key === 'Enter' && flat[selected]) {
      event.preventDefault()
      go(flat[selected].target)
    }
  }

  let position = -1
  return (
    <div className="ws-search" onKeyDown={onKeyDown}>
      <SearchField
        aria-label={`Pesquisar em ${current.label} e em todo o painel`}
        value={query}
        onChange={(value) => {
          onQueryChange(value)
          setActive(0)
        }}
      >
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input
            autoFocus
            placeholder={current.placeholder}
            aria-controls="ws-search-results"
            aria-activedescendant={flat.length ? `ws-hit-${selected}` : undefined}
          />
          <SearchField.ClearButton aria-label="Limpar pesquisa" />
        </SearchField.Group>
      </SearchField>
      <p className="ws-search-hint">
        Procure clientes, serviços, promoções, produtos, ajustes… Use <kbd>↑</kbd> <kbd>↓</kbd> e{' '}
        <kbd>Enter</kbd> para abrir.
      </p>
      <div
        id="ws-search-results"
        className="ws-search-results lx-scroll"
        role="listbox"
        aria-label="Resultados"
      >
        {blocks.map((block) => (
          <section key={block.key} className="ws-search-group" aria-label={block.label}>
            <h4>{block.label}</h4>
            <ul>
              {block.rows.map((row) => {
                position += 1
                const index = position
                const Icon = row.icon
                return (
                  <li key={row.key}>
                    <button
                      id={`ws-hit-${index}`}
                      type="button"
                      role="option"
                      aria-selected={index === selected}
                      data-active={index === selected}
                      className="ws-search-item"
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(row.target)}
                    >
                      <Icon size={18} aria-hidden />
                      <span>
                        <strong>
                          <Highlight text={row.title} needle={needle} />
                        </strong>
                        {row.detail ? <small>{row.detail}</small> : null}
                      </span>
                      <span className="ws-search-where">
                        {row.where} <ArrowRight size={14} aria-hidden />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
        {waiting ? (
          <p className="ws-search-hint" role="status">
            <Spinner size="sm" aria-hidden /> Procurando no seu espaço…
          </p>
        ) : null}
        {error ? (
          <p className="settings-field-error" role="alert">
            Não foi possível pesquisar agora. As páginas e ajustes continuam aparecendo.
          </p>
        ) : null}
        {!blocks.length && !waiting ? (
          <div className="biz-empty" role="status">
            <FileText size={22} aria-hidden />
            <p>
              Nada encontrado para “{query.trim()}”. Tente outra palavra, como o primeiro nome da
              cliente ou parte do nome do serviço.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function toRow(entry: IndexEntry, icon: LucideIcon, where: string, rank: number) {
  return {
    key: entry.id,
    icon,
    title: entry.title,
    detail: entry.detail,
    where,
    target: { section: entry.section, tab: entry.tab, anchor: entry.anchor, create: entry.create },
    rank,
    section: entry.section,
  }
}
