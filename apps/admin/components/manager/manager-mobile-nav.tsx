'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  CalendarDays,
  House,
  Menu,
  MessageCircle,
  Plus,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ManagerNavItem, ManagerSectionId } from './demo-data'
import { createActions } from './create-actions'
import { PlanCard } from './manager-plan'
import { supportWhatsAppUrl } from './support'
import type { GoTarget } from './workspace/workspace-signals'
import './manager-mobile-nav.css'

type Sheet = 'create' | 'menu' | null

const menuGroups: { label: string; ids: ManagerSectionId[] }[] = [
  {
    label: 'Negócio',
    ids: ['servicos', 'financeiro', 'estoque', 'marketing', 'relatorios', 'midia'],
  },
  { label: 'Espaço', ids: ['configuracoes'] },
]

/** The four fixed tabs; everything else lives in "Menu". */
const fixedTabs = new Set<ManagerSectionId>(['inicio', 'agenda', 'clientes'])

export function ManagerMobileNav({
  navigation,
  current,
  onSelect,
  go,
  pickMedia,
  onAccount,
  showPlan,
  planStatus,
  onPlan,
}: {
  navigation: ManagerNavItem[]
  current: ManagerSectionId
  onSelect: (section: ManagerSectionId) => void
  go: (target: GoTarget) => void
  pickMedia: () => void
  onAccount: () => void
  showPlan: boolean
  planStatus: string
  onPlan: () => void
}) {
  const [sheet, setSheet] = useState<Sheet>(null)
  const reduceMotion = useReducedMotion()
  const allowed = new Set(navigation.map((item) => item.id))
  const actions = createActions.filter((action) => allowed.has(action.section))
  const menuItems = navigation.filter((item) => !fixedTabs.has(item.id))
  const menuActive = !fixedTabs.has(current)

  useEffect(() => {
    if (!sheet) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSheet(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet])

  const toggle = (next: Exclude<Sheet, null>) => setSheet((open) => (open === next ? null : next))
  const pill = (on: boolean) =>
    on ? (
      <motion.span
        layoutId="mnav-pill"
        className="mnav-pill"
        aria-hidden
        transition={
          reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 480, damping: 36 }
        }
      />
    ) : null
  const tab = (id: ManagerSectionId, label: string, Icon: LucideIcon) =>
    allowed.has(id) ? (
      <button
        type="button"
        className="mnav-tab"
        aria-current={current === id && !sheet ? 'page' : undefined}
        onClick={() => {
          setSheet(null)
          onSelect(id)
        }}
      >
        {pill(current === id && !sheet)}
        <Icon size={21} aria-hidden />
        <span>{label}</span>
      </button>
    ) : (
      <span className="mnav-tab is-empty" aria-hidden />
    )

  const spring = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 520, damping: 32 }

  return (
    <>
      <AnimatePresence>
        {sheet ? (
          <motion.div
            key="backdrop"
            className="mnav-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            onClick={() => setSheet(null)}
          />
        ) : null}
        {sheet === 'create' ? (
          <motion.div
            key="create"
            id="mnav-create"
            className="mnav-sheet mnav-create"
            role="menu"
            aria-label="Criar"
            initial="closed"
            animate="open"
            exit="closed"
            variants={{
              open: { transition: { staggerChildren: reduceMotion ? 0 : 0.04 } },
              closed: {
                transition: { staggerChildren: reduceMotion ? 0 : 0.025, staggerDirection: -1 },
              },
            }}
          >
            {actions.map((action) => {
              const Icon = action.icon
              return (
                <motion.button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  className="mnav-create-item"
                  variants={{
                    open: { opacity: 1, y: 0, scale: 1 },
                    closed: { opacity: 0, y: 24, scale: 0.9 },
                  }}
                  transition={spring}
                  onClick={() => {
                    if (action.upload) {
                      setSheet(null)
                      pickMedia()
                      return
                    }
                    setSheet(null)
                    go({ section: action.section, create: action.create })
                  }}
                >
                  <span className="mnav-create-icon" aria-hidden>
                    <Icon size={20} />
                  </span>
                  <span className="mnav-create-copy">
                    <strong>{action.label}</strong>
                    <small>{action.detail}</small>
                  </span>
                </motion.button>
              )
            })}
          </motion.div>
        ) : null}
        {sheet === 'menu' ? (
          <motion.div
            key="menu"
            id="mnav-menu"
            className="mnav-sheet mnav-menu"
            role="menu"
            aria-label="Menu"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 32 }}
            transition={spring}
          >
            {menuGroups.map((group) => {
              const items = menuItems.filter((item) => group.ids.includes(item.id))
              if (!items.length) return null
              return (
                <div key={group.label} className="mnav-menu-group">
                  <p className="mnav-menu-label">{group.label}</p>
                  <div className="mnav-menu-grid">
                    {items.map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        role="menuitem"
                        className="mnav-menu-item"
                        aria-current={current === id ? 'page' : undefined}
                        onClick={() => {
                          setSheet(null)
                          onSelect(id)
                        }}
                      >
                        <span className="mnav-menu-icon" aria-hidden>
                          <Icon size={20} />
                        </span>
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
            {showPlan ? (
              <PlanCard
                status={planStatus}
                onOpen={() => {
                  setSheet(null)
                  onPlan()
                }}
              />
            ) : null}
            <div className="mnav-menu-footer">
              <button
                type="button"
                role="menuitem"
                className="mnav-menu-link"
                onClick={() => {
                  setSheet(null)
                  onAccount()
                }}
              >
                <UserRound size={18} aria-hidden /> Minha conta
              </button>
              <a
                role="menuitem"
                className="mnav-menu-link"
                href={supportWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setSheet(null)}
              >
                <MessageCircle size={18} aria-hidden /> Suporte no WhatsApp
              </a>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <nav className="manager-bottom-nav mnav" aria-label="Navegação móvel">
        {tab('inicio', 'Início', House)}
        {tab('agenda', 'Agenda', CalendarDays)}
        <div className="mnav-fab-slot">
          {actions.length ? (
            <motion.button
              type="button"
              className="mnav-fab"
              tabIndex={0}
              aria-label={sheet === 'create' ? 'Fechar criação rápida' : 'Criar'}
              aria-expanded={sheet === 'create'}
              aria-controls="mnav-create"
              whileTap={reduceMotion ? undefined : { scale: 0.9 }}
              animate={{ rotate: sheet === 'create' ? 135 : 0 }}
              transition={spring}
              onClick={() => toggle('create')}
            >
              <Plus size={26} strokeWidth={2.4} aria-hidden />
            </motion.button>
          ) : null}
        </div>
        {tab('clientes', 'Clientes', Users)}
        <button
          type="button"
          className="mnav-tab"
          aria-expanded={sheet === 'menu'}
          aria-controls="mnav-menu"
          aria-current={(menuActive && !sheet) || sheet === 'menu' ? 'page' : undefined}
          onClick={() => toggle('menu')}
        >
          {pill((menuActive && !sheet) || sheet === 'menu')}
          {sheet === 'menu' ? <X size={21} aria-hidden /> : <Menu size={21} aria-hidden />}
          <span>Menu</span>
        </button>
      </nav>
    </>
  )
}
