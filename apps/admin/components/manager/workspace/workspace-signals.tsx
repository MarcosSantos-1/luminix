'use client'

import { Button, Popover } from '@heroui/react'
import {
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Info,
  Megaphone,
  PartyPopper,
  X,
} from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { ClinicApi } from '../settings/clinic-api'
import { ActivityCenter } from './activity-center'
import {
  activityDetail,
  activityKinds,
  activityTitle,
  timeAgo,
  type ActivityItem,
} from './activity-copy'
import './workspace.css'

export type Notice = {
  id: string
  tone: 'info' | 'warning' | 'success'
  title: string
  text: string
  action?: { label: string; target: string; tab?: string }
}
export type GoTarget = {
  section: string
  tab?: string
  /** Prefills the search box of the destination page. */
  query?: string
  /** Visible text on the destination to scroll to and highlight. */
  anchor?: string
  /** Opens the "+" form of the destination page. */
  create?: boolean
}

type Signals = {
  notices: Notice[]
  dismiss: (id: string) => void
  unread: number
  recent: ActivityItem[]
  canAudit: boolean
  openCenter: () => void
  refresh: () => void
}
const Context = createContext<Signals | null>(null)

/** Luminix product news shown with the clinic notices (dismissible). */
const productNews: Notice[] = [
  {
    id: 'news-2026-11-media',
    tone: 'info',
    title: 'Novidade: Mídia, o acervo de fotos do seu espaço',
    text: 'Guarde fotos de clientes, antes e depois e do seu trabalho em um lugar privado.',
    action: { label: 'Conhecer', target: 'midia' },
  },
]

function dismissedKey(clinicId: string) {
  return `luminix:notices:${clinicId}`
}

function readDismissed(clinicId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(dismissedKey(clinicId)) ?? '[]') as string[]
  } catch {
    return []
  }
}

export function WorkspaceSignals({
  api,
  clinicId,
  canAudit,
  go,
  children,
}: {
  api: ClinicApi
  clinicId: string
  canAudit: boolean
  go: (target: GoTarget) => void
  children: ReactNode
}) {
  const [notices, setNotices] = useState<Notice[]>([])
  const [dismissed, setDismissed] = useState<string[]>(() =>
    typeof window === 'undefined' ? [] : readDismissed(clinicId),
  )
  const [unread, setUnread] = useState(0)
  const [recent, setRecent] = useState<ActivityItem[]>([])
  const [centerOpen, setCenterOpen] = useState(false)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((value) => value + 1), [])
  useEffect(() => {
    const timer = setInterval(refresh, 60_000)
    return () => clearInterval(timer)
  }, [refresh])
  useEffect(() => {
    if (!api.ready) return
    let active = true
    void api
      .get<{ notices: Notice[] }>('notices')
      .then((data) => active && setNotices(data.notices))
      .catch(() => undefined)
    if (canAudit)
      void api
        .get<{ items: ActivityItem[]; unread: number }>('activity')
        .then((data) => {
          if (!active) return
          setUnread(data.unread)
          setRecent(data.items.filter((item) => item.state === 'unread').slice(0, 6))
        })
        .catch(() => undefined)
    return () => {
      active = false
    }
  }, [api, canAudit, tick])

  const dismiss = useCallback(
    (id: string) => {
      setDismissed((current) => {
        const next = [...new Set([...current, id])].slice(-200)
        try {
          localStorage.setItem(dismissedKey(clinicId), JSON.stringify(next))
        } catch {
          // Private mode: the notice simply comes back next time.
        }
        return next
      })
    },
    [clinicId],
  )
  const visible = useMemo(
    () => [...notices, ...productNews].filter((notice) => !dismissed.includes(notice.id)),
    [notices, dismissed],
  )
  const value = useMemo<Signals>(
    () => ({
      notices: visible,
      dismiss,
      unread,
      recent,
      canAudit,
      openCenter: () => setCenterOpen(true),
      refresh,
    }),
    [visible, dismiss, unread, recent, canAudit, refresh],
  )

  return (
    <Context.Provider value={value}>
      {children}
      {canAudit ? (
        <ActivityCenter
          api={api}
          isOpen={centerOpen}
          onOpenChange={(open) => {
            setCenterOpen(open)
            if (!open) refresh()
          }}
          onUnreadChange={setUnread}
          onNavigate={(section) => go({ section })}
        />
      ) : null}
    </Context.Provider>
  )
}

export function useWorkspaceSignals() {
  return useContext(Context)
}

const toneIcon = { info: Info, warning: CircleAlert, success: PartyPopper }

/** Header bell: notices + unread activity, with access to the activity center. */
export function NotificationBell({
  api,
  go,
  onOpenUpdates,
}: {
  api: ClinicApi
  go: (target: GoTarget) => void
  onOpenUpdates: () => void
}) {
  const signals = useWorkspaceSignals()
  const [open, setOpen] = useState(false)
  if (!signals) return null
  const count =
    signals.unread + signals.notices.filter((notice) => notice.tone === 'warning').length
  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Button
        isIconOnly
        className="manager-icon-button ws-bell"
        aria-label={count ? `Notificações: ${count} novas` : 'Notificações'}
      >
        <Bell size={20} />
        {count ? <span className="ws-badge">{count > 99 ? '99+' : count}</span> : null}
      </Button>
      <Popover.Content className="ws-popover lx-popover" placement="bottom end">
        <Popover.Dialog>
          <div className="ws-pop-head">
            <strong>Notificações</strong>
            {signals.canAudit && signals.unread ? (
              <Button
                size="sm"
                variant="ghost"
                onPress={() =>
                  void api
                    .post('activity/state', { all: true, state: 'read' })
                    .then(signals.refresh)
                }
              >
                <CheckCheck size={14} aria-hidden /> Marcar lidas
              </Button>
            ) : null}
          </div>
          <div className="ws-pop-body lx-scroll">
            {signals.notices.length ? (
              <section aria-label="Avisos">
                <h4>Avisos</h4>
                <ul className="ws-pop-list">
                  {signals.notices.slice(0, 5).map((notice) => {
                    const Icon = toneIcon[notice.tone]
                    return (
                      <li key={notice.id} className={`is-${notice.tone}`}>
                        <Icon size={16} aria-hidden />
                        <button
                          type="button"
                          onClick={() => {
                            if (notice.action)
                              go({ section: notice.action.target, tab: notice.action.tab })
                            setOpen(false)
                          }}
                        >
                          <strong>{notice.title}</strong>
                          <small>{notice.text}</small>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ) : null}
            {signals.canAudit ? (
              <section aria-label="Atividades novas">
                <h4>Atividades novas</h4>
                {signals.recent.length ? (
                  <ul className="ws-pop-list">
                    {signals.recent.map((item) => {
                      const kind = activityKinds[item.entity] ?? activityKinds.appointments
                      const Icon = kind.icon
                      return (
                        <li key={item.id}>
                          <Icon size={16} aria-hidden />
                          <button
                            type="button"
                            onClick={() => {
                              void api
                                .post('activity/state', { ids: [item.id], state: 'read' })
                                .then(signals.refresh)
                              go({ section: kind.section })
                              setOpen(false)
                            }}
                          >
                            <strong>{activityTitle(item)}</strong>
                            <small>
                              {activityDetail(item) || '—'} · {timeAgo(item.createdAt)}
                            </small>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="settings-muted">Você está em dia.</p>
                )}
              </section>
            ) : null}
          </div>
          <div className="ws-pop-foot">
            {signals.canAudit ? (
              <Button
                size="sm"
                onPress={() => {
                  setOpen(false)
                  signals.openCenter()
                }}
              >
                Ver todas as atividades
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onPress={() => {
                setOpen(false)
                onOpenUpdates()
              }}
            >
              <Megaphone size={14} aria-hidden /> Novidades da Luminix
            </Button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}

/** Notices on top of the page, one at a time with arrows and steps ("2 de 4"). */
export function NoticeCarousel({ go }: { go: (target: GoTarget) => void }) {
  const signals = useWorkspaceSignals()
  const [index, setIndex] = useState(0)
  if (!signals || !signals.notices.length) return null
  const total = signals.notices.length
  const current = Math.min(index, total - 1)
  const notice = signals.notices[current]
  const Icon = toneIcon[notice.tone]
  return (
    <section
      className={`ws-carousel is-${notice.tone}`}
      aria-roledescription="carrossel"
      aria-label="Avisos"
    >
      <span className="ws-carousel-icon" aria-hidden>
        <Icon size={20} />
      </span>
      <div className="ws-carousel-copy" aria-live="polite">
        <strong>{notice.title}</strong>
        <span>{notice.text}</span>
      </div>
      {notice.action ? (
        <Button
          size="sm"
          className="ws-carousel-action"
          onPress={() => go({ section: notice.action!.target, tab: notice.action!.tab })}
        >
          {notice.action.label}
        </Button>
      ) : null}
      {total > 1 ? (
        <div className="ws-carousel-nav">
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label="Aviso anterior"
            onPress={() => setIndex((current - 1 + total) % total)}
          >
            <ChevronLeft size={16} />
          </Button>
          <span className="ws-steps" aria-label={`Aviso ${current + 1} de ${total}`}>
            {signals.notices.map((item, position) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Ir para o aviso ${position + 1}`}
                aria-current={position === current ? 'step' : undefined}
                onClick={() => setIndex(position)}
              />
            ))}
          </span>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label="Próximo aviso"
            onPress={() => setIndex((current + 1) % total)}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      ) : null}
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        className="ws-carousel-close"
        aria-label="Dispensar este aviso"
        onPress={() => signals.dismiss(notice.id)}
      >
        <X size={15} />
      </Button>
    </section>
  )
}

/** A search result that opens a page with its own search box already filled in. */
export type SearchFocus = { section: string; query: string; nonce: number }
const consumedFocus = new Set<number>()

/** Applies a search focus once (coming back to the page later does not refill it). */
export function useSearchFocus(
  focus: SearchFocus | null | undefined,
  apply: (query: string) => void,
) {
  useEffect(() => {
    if (!focus || consumedFocus.has(focus.nonce)) return
    consumedFocus.add(focus.nonce)
    apply(focus.query)
  }, [focus, apply])
}
