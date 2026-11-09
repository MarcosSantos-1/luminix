'use client'

import { Button, Drawer, Spinner, useOverlayState } from '@heroui/react'
import {
  Archive,
  ArchiveRestore,
  Check,
  CheckCheck,
  Eye,
  EyeOff,
  Inbox,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { CheckboxField } from '@/components/ui/fields'
import type { ClinicApi } from '../settings/clinic-api'
import { HelpTip } from '../settings/settings-kit'
import {
  activityDetail,
  activityKinds,
  activityTitle,
  timeAgo,
  type ActivityItem,
} from './activity-copy'
import './workspace.css'

type Page = { items: ActivityItem[]; unread: number; nextBefore: string | null }

/**
 * "Central de atividades": everything that happened in the clinic. Read, archive and delete
 * only change this person's view; the audit history itself is never altered.
 */
export function ActivityCenter({
  api,
  isOpen,
  onOpenChange,
  onUnreadChange,
  onNavigate,
}: {
  api: ClinicApi
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onUnreadChange?: (count: number) => void
  onNavigate: (section: string) => void
}) {
  const state = useOverlayState({ isOpen, onOpenChange })
  const [view, setView] = useState<'inbox' | 'archived'>('inbox')
  const [entity, setEntity] = useState('')
  const [items, setItems] = useState<ActivityItem[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(
    async (before?: string | null) => {
      setError('')
      try {
        const page = await api.get<Page>('activity', {
          ...(view === 'archived' ? { view } : {}),
          ...(entity ? { entity } : {}),
          ...(before ? { before } : {}),
        })
        setItems((current) => (before && current ? [...current, ...page.items] : page.items))
        setNext(page.nextBefore)
        onUnreadChange?.(page.unread)
      } catch {
        setError('Não foi possível carregar as atividades.')
      }
    },
    [api, view, entity, onUnreadChange],
  )

  useEffect(() => {
    if (!isOpen) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload when the drawer opens or filters change
    setItems(null)
    setSelected(new Set())
    void load()
  }, [isOpen, load])

  async function change(ids: string[] | 'all', next: 'read' | 'archived' | 'hidden' | 'unread') {
    setBusy(true)
    try {
      await api.post(
        'activity/state',
        ids === 'all' ? { all: true, state: next } : { ids, state: next },
      )
      setSelected(new Set())
      await load()
    } catch {
      setError('Não foi possível atualizar. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  const list = items ?? []
  const selectedIds = [...selected]
  const toggle = (id: string) =>
    setSelected((current) => {
      const copy = new Set(current)
      if (copy.has(id)) copy.delete(id)
      else copy.add(id)
      return copy
    })

  return (
    <Drawer state={state}>
      <Drawer.Backdrop variant="blur" className="ws-drawer">
        <Drawer.Content placement="right">
          <Drawer.Dialog className="ws-drawer-dialog">
            <Drawer.Header>
              <Drawer.Heading>
                Atividades
                <HelpTip title="O que acontece se eu apagar?">
                  Apagar e arquivar só mudam a sua lista. O histórico do espaço continua guardado
                  com segurança e as outras pessoas da equipe continuam vendo.
                </HelpTip>
              </Drawer.Heading>
              <Drawer.CloseTrigger />
            </Drawer.Header>
            <Drawer.Body className="lx-scroll">
              <div className="ws-tabs" role="tablist" aria-label="Lista">
                {(
                  [
                    ['inbox', 'Caixa de entrada', Inbox],
                    ['archived', 'Arquivadas', Archive],
                  ] as const
                ).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={view === id}
                    onClick={() => setView(id)}
                  >
                    <Icon size={16} aria-hidden /> {label}
                  </button>
                ))}
              </div>
              <div className="biz-chips ws-filters" role="group" aria-label="Filtrar por tipo">
                <button type="button" aria-pressed={!entity} onClick={() => setEntity('')}>
                  Tudo
                </button>
                {Object.entries(activityKinds).map(([id, kind]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={entity === id}
                    onClick={() => setEntity(entity === id ? '' : id)}
                  >
                    {kind.label}
                  </button>
                ))}
              </div>
              <div className="ws-bulk">
                {selectedIds.length ? (
                  <>
                    <span>{selectedIds.length} selecionadas</span>
                    {view === 'inbox' ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          isDisabled={busy}
                          onPress={() => void change(selectedIds, 'read')}
                        >
                          <Check size={14} aria-hidden /> Marcar lidas
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          isDisabled={busy}
                          onPress={() => void change(selectedIds, 'archived')}
                        >
                          <Archive size={14} aria-hidden /> Arquivar
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        isDisabled={busy}
                        onPress={() => void change(selectedIds, 'unread')}
                      >
                        <ArchiveRestore size={14} aria-hidden /> Devolver
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      isDisabled={busy}
                      onPress={() => void change(selectedIds, 'hidden')}
                    >
                      <Trash2 size={14} aria-hidden /> Apagar
                    </Button>
                  </>
                ) : view === 'inbox' && list.some((item) => item.state === 'unread') ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    isDisabled={busy}
                    onPress={() => void change('all', 'read')}
                  >
                    <CheckCheck size={14} aria-hidden /> Marcar todas como lidas
                  </Button>
                ) : null}
              </div>
              {error ? (
                <p className="settings-field-error" role="alert">
                  {error}
                </p>
              ) : null}
              {!items ? (
                <div className="ws-loading" role="status">
                  <Spinner size="sm" aria-hidden /> Carregando…
                </div>
              ) : list.length ? (
                <ul className="ws-activity">
                  {list.map((item) => {
                    const kind = activityKinds[item.entity] ?? activityKinds.appointments
                    const Icon = kind.icon
                    return (
                      <li
                        key={item.id}
                        className={item.state === 'unread' ? 'is-unread' : undefined}
                      >
                        <CheckboxField
                          className="ws-select"
                          label={<span className="sr-only">Selecionar</span>}
                          isSelected={selected.has(item.id)}
                          onChange={() => toggle(item.id)}
                        />
                        <span className="ws-icon" aria-hidden>
                          <Icon size={17} />
                        </span>
                        <button
                          type="button"
                          className="ws-activity-copy"
                          onClick={() => {
                            if (item.state === 'unread') void change([item.id], 'read')
                            onNavigate(kind.section)
                            onOpenChange(false)
                          }}
                        >
                          <strong>{activityTitle(item)}</strong>
                          <span>{activityDetail(item) || '—'}</span>
                          <small>
                            {timeAgo(item.createdAt)}
                            {item.actor ? ` · por ${item.actor}` : ''}
                          </small>
                        </button>
                        <div className="ws-row-actions">
                          {view === 'inbox' ? (
                            <>
                              <Button
                                isIconOnly
                                size="sm"
                                variant="ghost"
                                aria-label={
                                  item.state === 'unread'
                                    ? 'Marcar como lida'
                                    : 'Marcar como não lida'
                                }
                                onPress={() =>
                                  void change(
                                    [item.id],
                                    item.state === 'unread' ? 'read' : 'unread',
                                  )
                                }
                              >
                                {item.state === 'unread' ? <Eye size={15} /> : <EyeOff size={15} />}
                              </Button>
                              <Button
                                isIconOnly
                                size="sm"
                                variant="ghost"
                                aria-label="Arquivar"
                                onPress={() => void change([item.id], 'archived')}
                              >
                                <Archive size={15} />
                              </Button>
                            </>
                          ) : (
                            <Button
                              isIconOnly
                              size="sm"
                              variant="ghost"
                              aria-label="Devolver para a caixa"
                              onPress={() => void change([item.id], 'unread')}
                            >
                              <ArchiveRestore size={15} />
                            </Button>
                          )}
                          <Button
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            aria-label="Apagar da minha lista"
                            onPress={() => void change([item.id], 'hidden')}
                          >
                            <Trash2 size={15} />
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="biz-empty">
                  <Inbox size={24} aria-hidden />
                  <p>{view === 'inbox' ? 'Nada novo por aqui.' : 'Nenhuma atividade arquivada.'}</p>
                </div>
              )}
              {next ? (
                <Button variant="secondary" isDisabled={busy} onPress={() => void load(next)}>
                  Carregar mais
                </Button>
              ) : null}
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  )
}
