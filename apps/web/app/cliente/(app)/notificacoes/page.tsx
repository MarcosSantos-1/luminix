'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CalendarDays, CheckCheck, Smartphone, Store, Tag, Trash2, X } from 'lucide-react'
import {
  deleteNotices,
  markNoticesRead,
  refreshSpace,
  useClient,
} from '../../../../lib/client-app/store'
import { timeAgo } from '../../../../lib/client-app/format'
import type { Notice, NoticeKind } from '../../../../lib/client-app/types'
import { Empty, PageHeader } from '../../../../components/client-app/ui'
import { toast } from '../../../../components/client-app/toast'

const icons = { booking: CalendarDays, promo: Tag, space: Store, app: Smartphone }

type Filter = 'all' | 'unread' | NoticeKind
const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'unread', label: 'Não lidas' },
  { value: 'booking', label: 'Horários' },
  { value: 'promo', label: 'Promoções' },
  { value: 'space', label: 'Do espaço' },
]

/** Today, yesterday, this week, before. */
function groupOf(at: string, now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const time = new Date(at).getTime()
  if (time >= start) return 'Hoje'
  if (time >= start - 86_400_000) return 'Ontem'
  if (time >= start - 6 * 86_400_000) return 'Nesta semana'
  return 'Antes'
}

export default function NoticesPage() {
  const router = useRouter()
  const { space } = useClient()
  const slug = space?.summary.slug
  const [filter, setFilter] = useState<Filter>('all')
  const [leaving, setLeaving] = useState<string[]>([])
  const now = useMemo(() => new Date(), [])
  useEffect(() => {
    if (slug) void refreshSpace(slug)
  }, [slug])

  const notices = useMemo(() => space?.notices ?? [], [space])
  const shown = useMemo(
    () =>
      notices.filter((item) =>
        filter === 'all' ? true : filter === 'unread' ? !item.read : item.kind === filter,
      ),
    [notices, filter],
  )
  const groups = useMemo(() => {
    const map = new Map<string, Notice[]>()
    for (const item of shown) {
      const key = groupOf(item.at, now)
      map.set(key, [...(map.get(key) ?? []), item])
    }
    return [...map.entries()]
  }, [shown, now])

  if (!space || !slug) return null
  const unread = notices.filter((item) => !item.read).length
  const counts = (value: Filter) =>
    value === 'all'
      ? notices.length
      : value === 'unread'
        ? unread
        : notices.filter((item) => item.kind === value).length

  /** Slides out, then leaves this device. */
  function remove(ids: string[]) {
    setLeaving((current) => [...current, ...ids])
    setTimeout(() => {
      deleteNotices(ids)
      setLeaving((current) => current.filter((id) => !ids.includes(id)))
    }, 260)
  }

  return (
    <div className="ca-page ca-notices-page">
      <PageHeader
        title="Notificações"
        kicker={unread ? `${unread} não ${unread === 1 ? 'lida' : 'lidas'}` : 'Tudo em dia'}
      />

      <div className="ca-notice-bar">
        <div className="ca-chips" role="group" aria-label="Filtrar notificações">
          {filters
            .filter(({ value }) => value === 'all' || value === 'unread' || counts(value) > 0)
            .map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
                {counts(value) > 0 && <b className="ca-chip-count">{counts(value)}</b>}
              </button>
            ))}
        </div>
        {notices.length > 0 && (
          <div className="ca-notice-tools">
            <button
              type="button"
              className="ca-tool"
              disabled={!unread}
              onClick={() => {
                markNoticesRead(slug)
                toast.success('Tudo marcado como lido')
              }}
            >
              <CheckCheck size={16} aria-hidden /> Marcar como lidas
            </button>
            <button
              type="button"
              className="ca-tool is-danger"
              onClick={() => {
                const ids = shown.map((item) => item.id)
                remove(ids)
                toast.info(
                  ids.length === 1 ? 'Notificação apagada' : `${ids.length} notificações apagadas`,
                )
              }}
              disabled={!shown.length}
            >
              <Trash2 size={16} aria-hidden /> Apagar {filter === 'all' ? 'todas' : 'estas'}
            </button>
          </div>
        )}
      </div>

      {groups.length ? (
        groups.map(([label, items]) => (
          <section key={label} className="ca-section ca-notice-group">
            <h2>{label}</h2>
            <ul className="ca-list ca-notices">
              {items.map((item) => {
                const Icon = icons[item.kind] ?? Bell
                return (
                  <li
                    key={item.id}
                    data-unread={!item.read || undefined}
                    data-kind={item.kind}
                    data-leaving={leaving.includes(item.id) || undefined}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        markNoticesRead(slug, item.id)
                        if (item.href) router.push(item.href)
                      }}
                    >
                      <span className="ca-list-icon">
                        <Icon size={18} aria-hidden />
                      </span>
                      <span className="ca-list-text">
                        <strong>{item.title}</strong>
                        <small>{item.body}</small>
                        <time>{timeAgo(item.at)}</time>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="ca-notice-delete"
                      aria-label={`Apagar "${item.title}"`}
                      onClick={() => remove([item.id])}
                    >
                      <X size={16} aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      ) : (
        <Empty title={filter === 'all' ? 'Nenhuma notificação' : 'Nada por aqui'}>
          <p>
            {filter === 'all'
              ? 'Confirmações, lembretes e avisos do espaço aparecem aqui.'
              : 'Nenhuma notificação neste filtro.'}
          </p>
        </Empty>
      )}
    </div>
  )
}
