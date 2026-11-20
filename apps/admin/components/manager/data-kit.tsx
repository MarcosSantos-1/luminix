'use client'

import { Button, Popover } from '@heroui/react'
import { Check, ListFilter } from 'lucide-react'
import type { ReactNode } from 'react'
import './data-kit.css'

export type Kpi = {
  id: string
  label: string
  value: ReactNode
  hint?: ReactNode
  icon: ReactNode
  tone?: 'accent' | 'good' | 'warn' | 'info'
}

/**
 * Summary cards of a list page. With `onSelect` each card is also a filter: pressing it narrows
 * the list below, pressing it again clears it.
 */
export function KpiCards({
  items,
  label,
  active,
  onSelect,
}: {
  items: Kpi[]
  label: string
  active?: string
  onSelect?: (id: string) => void
}) {
  return (
    <div className="kpi-grid" role="group" aria-label={label}>
      {items.map((item) => {
        const body = (
          <>
            <span className={`kpi-icon tone-${item.tone ?? 'accent'}`} aria-hidden>
              {item.icon}
            </span>
            <span className="kpi-copy">
              <span className="kpi-label">{item.label}</span>
              <strong>{item.value}</strong>
              {item.hint ? <small>{item.hint}</small> : null}
            </span>
          </>
        )
        return onSelect ? (
          <button
            key={item.id}
            type="button"
            className="kpi"
            aria-pressed={active === item.id}
            onClick={() => onSelect(item.id)}
          >
            {body}
          </button>
        ) : (
          <div key={item.id} className="kpi">
            {body}
          </div>
        )
      })}
    </div>
  )
}

export type FilterGroup = {
  id: string
  label: string
  options: { id: string; label: string; count?: number }[]
}
export type FilterValue = Record<string, string[]>

/** One "Filtros" button that opens every filter of the page as checkboxes. */
export function FilterMenu({
  groups,
  value,
  onChange,
  activeCount,
  onClear,
  sort,
  iconOnly = false,
}: {
  groups: FilterGroup[]
  value: FilterValue
  onChange: (value: FilterValue) => void
  /** Filters that differ from the default; shown on the button. */
  activeCount: number
  onClear: () => void
  /** "Ordenar por" inside the same menu, as a single choice above the filters. */
  sort?: { value: string; options: { id: string; label: string }[]; onChange: (id: string) => void }
  /** Only the funnel icon on the button (it sits beside the search box). */
  iconOnly?: boolean
}) {
  return (
    <Popover>
      <Button
        variant="secondary"
        isIconOnly={iconOnly}
        className={`filter-trigger${iconOnly ? ' is-icon' : ''}`}
        aria-label={activeCount ? `Filtros e ordem (${activeCount} ativos)` : 'Filtros e ordem'}
      >
        <ListFilter size={iconOnly ? 19 : 17} aria-hidden /> {iconOnly ? null : 'Filtros'}
        {activeCount ? <span className="filter-count">{activeCount}</span> : null}
      </Button>
      <Popover.Content className="filter-popover" placement="bottom end">
        <Popover.Dialog aria-label="Filtros">
          {sort ? (
            <div className="filter-group" role="radiogroup" aria-label="Ordenar por">
              <span className="filter-group-label">Ordenar por</span>
              {sort.options.map((option) => {
                const selected = sort.value === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className="filter-option is-radio"
                    onClick={() => sort.onChange(option.id)}
                  >
                    <span className="filter-box" aria-hidden>
                      {selected ? <Check size={13} strokeWidth={3} /> : null}
                    </span>
                    <span>{option.label}</span>
                  </button>
                )
              })}
            </div>
          ) : null}
          {groups.map((group) => (
            <div key={group.id} className="filter-group" role="group" aria-label={group.label}>
              <span className="filter-group-label">{group.label}</span>
              {group.options.map((option) => {
                const selected = (value[group.id] ?? []).includes(option.id)
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    className="filter-option"
                    onClick={() =>
                      onChange({
                        ...value,
                        [group.id]: selected
                          ? (value[group.id] ?? []).filter((id) => id !== option.id)
                          : [...(value[group.id] ?? []), option.id],
                      })
                    }
                  >
                    <span className="filter-box" aria-hidden>
                      {selected ? <Check size={13} strokeWidth={3} /> : null}
                    </span>
                    <span>{option.label}</span>
                    {option.count != null ? <small>{option.count}</small> : null}
                  </button>
                )
              })}
            </div>
          ))}
          <button type="button" className="filter-clear" disabled={!activeCount} onClick={onClear}>
            Limpar filtros
          </button>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}

/**
 * Makes a dialog grow out of the card that opened it (and settle in place), so the eye follows
 * where the details came from. `from` is the card's rectangle at the moment of the click.
 */
export function morphFrom(dialog: HTMLElement | null, from: DOMRect | null) {
  if (!dialog || !from || typeof dialog.animate !== 'function') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const to = dialog.getBoundingClientRect()
  if (!to.width || !to.height) return
  const scaleX = Math.max(from.width / to.width, 0.2)
  const scaleY = Math.max(from.height / to.height, 0.12)
  const x = from.left + from.width / 2 - (to.left + to.width / 2)
  const y = from.top + from.height / 2 - (to.top + to.height / 2)
  const easing = 'cubic-bezier(0.22, 1, 0.36, 1)'
  dialog.animate(
    [
      { transform: `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`, opacity: 0.35 },
      { transform: 'none', opacity: 1 },
    ],
    { duration: 420, easing },
  )
  for (const child of Array.from(dialog.children))
    child.animate([{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }], {
      duration: 420,
      easing: 'ease-out',
    })
}
