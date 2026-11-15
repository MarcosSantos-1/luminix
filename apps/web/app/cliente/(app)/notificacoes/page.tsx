'use client'

import { useRouter } from 'next/navigation'
import { Bell, CalendarDays, Smartphone, Store, Tag } from 'lucide-react'
import { markNoticesRead, useClient } from '../../../../lib/client-app/store'
import { timeAgo } from '../../../../lib/client-app/format'
import { Empty, PageHeader } from '../../../../components/client-app/ui'

const icons = { booking: CalendarDays, promo: Tag, space: Store, app: Smartphone }

export default function NoticesPage() {
  const router = useRouter()
  const { space } = useClient()
  if (!space) return null
  const slug = space.summary.slug
  const unread = space.notices.filter((item) => !item.read).length

  return (
    <div className="ca-page">
      <PageHeader
        title="Notificações"
        kicker={unread ? `${unread} não ${unread === 1 ? 'lida' : 'lidas'}` : 'Tudo em dia'}
        action={
          unread > 0 && (
            <button type="button" className="ca-link" onClick={() => markNoticesRead(slug)}>
              Marcar todas como lidas
            </button>
          )
        }
      />
      {space.notices.length ? (
        <ul className="ca-list ca-notices">
          {space.notices.map((item) => {
            const Icon = icons[item.kind] ?? Bell
            return (
              <li key={item.id} data-unread={!item.read || undefined}>
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
                  </span>
                  <time>{timeAgo(item.at)}</time>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <Empty title="Nenhuma notificação">
          <p>Confirmações, lembretes e avisos do espaço aparecem aqui.</p>
        </Empty>
      )}
    </div>
  )
}
