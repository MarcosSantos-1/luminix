'use client'

/**
 * Date wheel picker (iOS-like), adapted from the 21st.dev component. Colors come from CSS
 * variables so it works on the dark manager panels and the light pages:
 * --wheel-fg, --wheel-muted, --wheel-band, --wheel-line. The ends fade with a mask.
 */
import * as React from 'react'
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
  type PanInfo,
} from 'framer-motion'
import { cn } from '@/lib/utils'

export interface DateWheelPickerProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'onChange'
> {
  value?: Date
  onChange: (date: Date) => void
  minYear?: number
  maxYear?: number
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  locale?: string
}

const ITEM_HEIGHT = 40
const VISIBLE_ITEMS = 5
const PERSPECTIVE_ORIGIN = ITEM_HEIGHT * 2

function getMonthNames(locale?: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { month: 'long' })
  return Array.from({ length: 12 }, (_, i) => formatter.format(new Date(2000, i, 1)))
}

const sizeConfig = {
  sm: { itemHeight: ITEM_HEIGHT * 0.8, fontSize: 'text-sm', gap: 'gap-2' },
  md: { itemHeight: ITEM_HEIGHT, fontSize: 'text-base', gap: 'gap-2' },
  lg: { itemHeight: ITEM_HEIGHT * 1.2, fontSize: 'text-lg', gap: 'gap-6' },
}

interface WheelItemProps {
  item: string | number
  index: number
  y: MotionValue<number>
  itemHeight: number
  visibleItems: number
  centerOffset: number
  isSelected: boolean
  disabled?: boolean
  onClick: () => void
}

function WheelItem({
  item,
  index,
  y,
  itemHeight,
  visibleItems,
  centerOffset,
  isSelected,
  disabled,
  onClick,
}: WheelItemProps) {
  const itemY = useTransform(y, (latest) => index * itemHeight + latest + centerOffset)
  const rotateX = useTransform(itemY, [0, centerOffset, itemHeight * visibleItems], [45, 0, -45])
  const scale = useTransform(itemY, [0, centerOffset, itemHeight * visibleItems], [0.8, 1, 0.8])
  const opacity = useTransform(
    itemY,
    [0, centerOffset * 0.5, centerOffset, centerOffset * 1.5, itemHeight * visibleItems],
    [0.3, 0.6, 1, 0.6, 0.3],
  )

  return (
    <motion.div
      className="flex items-center justify-center select-none"
      style={{
        height: itemHeight,
        rotateX,
        scale,
        opacity,
        transformStyle: 'preserve-3d',
        transformOrigin: `center center -${PERSPECTIVE_ORIGIN}px`,
      }}
      onClick={() => !disabled && onClick()}
    >
      <span
        className="font-medium transition-colors"
        style={{
          color: isSelected
            ? 'var(--wheel-fg, var(--foreground))'
            : 'var(--wheel-muted, var(--muted))',
        }}
      >
        {item}
      </span>
    </motion.div>
  )
}

interface WheelColumnProps {
  items: (string | number)[]
  value: number
  onChange: (index: number) => void
  itemHeight: number
  visibleItems: number
  disabled?: boolean
  className?: string
  ariaLabel: string
}

function WheelColumn({
  items,
  value,
  onChange,
  itemHeight,
  visibleItems,
  disabled,
  className,
  ariaLabel,
}: WheelColumnProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const y = useMotionValue(-value * itemHeight)
  const centerOffset = Math.floor(visibleItems / 2) * itemHeight

  const valueRef = React.useRef(value)
  const onChangeRef = React.useRef(onChange)
  const itemsLengthRef = React.useRef(items.length)

  React.useEffect(() => {
    valueRef.current = value
    onChangeRef.current = onChange
    itemsLengthRef.current = items.length
  })

  React.useEffect(() => {
    animate(y, -value * itemHeight, { type: 'spring', stiffness: 300, damping: 30 })
  }, [value, itemHeight, y])

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (disabled) return
    const projectedY = y.get() + info.velocity.y * 0.2
    const newIndex = Math.max(0, Math.min(items.length - 1, Math.round(-projectedY / itemHeight)))
    onChange(newIndex)
  }

  React.useEffect(() => {
    const container = containerRef.current
    if (!container || disabled) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const direction = event.deltaY > 0 ? 1 : -1
      const current = valueRef.current
      const next = Math.max(0, Math.min(itemsLengthRef.current - 1, current + direction))
      if (next !== current) onChangeRef.current(next)
    }
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [disabled])

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return
    const maxIndex = items.length - 1
    const moves: Record<string, number> = {
      ArrowUp: Math.max(0, value - 1),
      ArrowDown: Math.min(maxIndex, value + 1),
      Home: 0,
      End: maxIndex,
      PageUp: Math.max(0, value - 5),
      PageDown: Math.min(maxIndex, value + 5),
    }
    if (!(event.key in moves)) return
    event.preventDefault()
    if (moves[event.key] !== value) onChange(moves[event.key])
  }

  const dragConstraints = React.useMemo(
    () => ({ top: -(items.length - 1) * itemHeight, bottom: 0 }),
    [items.length, itemHeight],
  )
  // Fades the ends with a mask, so it blends into any background (light, dark, glass).
  const fade = `linear-gradient(to bottom, transparent 0%, #000 ${centerOffset * 0.9}px, #000 calc(100% - ${centerOffset * 0.9}px), transparent 100%)`

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative touch-none overflow-hidden rounded-xl outline-none focus-visible:ring-2',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
      style={{ height: itemHeight * visibleItems, maskImage: fade, WebkitMaskImage: fade }}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      role="spinbutton"
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={items.length - 1}
      aria-valuetext={String(items[value])}
      aria-disabled={disabled}
    >
      <div
        className="pointer-events-none absolute inset-x-0 z-[5] rounded-lg border-y"
        style={{
          top: centerOffset,
          height: itemHeight,
          borderColor: 'var(--wheel-line, rgba(0,0,0,0.08))',
          background: 'var(--wheel-band, rgba(0,0,0,0.03))',
        }}
        aria-hidden="true"
      />
      <motion.div
        className="cursor-grab active:cursor-grabbing"
        style={{ y, paddingTop: centerOffset, paddingBottom: centerOffset }}
        drag="y"
        dragConstraints={dragConstraints}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
      >
        {items.map((item, index) => (
          <WheelItem
            key={`${item}-${index}`}
            item={item}
            index={index}
            y={y}
            itemHeight={itemHeight}
            visibleItems={visibleItems}
            centerOffset={centerOffset}
            isSelected={index === value}
            disabled={disabled}
            onClick={() => onChange(index)}
          />
        ))}
      </motion.div>
    </div>
  )
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

const DateWheelPicker = React.forwardRef<HTMLDivElement, DateWheelPickerProps>(
  (
    {
      value,
      onChange,
      minYear = 1920,
      maxYear = new Date().getFullYear(),
      size = 'md',
      disabled = false,
      locale = 'pt-BR',
      className,
      ...props
    },
    ref,
  ) => {
    const config = sizeConfig[size]
    const months = React.useMemo(() => getMonthNames(locale), [locale])
    const years = React.useMemo(() => {
      const list: number[] = []
      for (let year = maxYear; year >= minYear; year--) list.push(year)
      return list
    }, [minYear, maxYear])

    const [dateState, setDateState] = React.useState(() => {
      const current = value || new Date()
      return { day: current.getDate(), month: current.getMonth(), year: current.getFullYear() }
    })
    const isInternalChange = React.useRef(false)

    const days = React.useMemo(
      () =>
        Array.from({ length: getDaysInMonth(dateState.year, dateState.month) }, (_, i) => i + 1),
      [dateState.month, dateState.year],
    )

    const handleDayChange = React.useCallback((dayIndex: number) => {
      isInternalChange.current = true
      setDateState((prev) => ({ ...prev, day: dayIndex + 1 }))
    }, [])
    const handleMonthChange = React.useCallback((monthIndex: number) => {
      isInternalChange.current = true
      setDateState((prev) => ({
        ...prev,
        month: monthIndex,
        day: Math.min(prev.day, getDaysInMonth(prev.year, monthIndex)),
      }))
    }, [])
    const handleYearChange = React.useCallback(
      (yearIndex: number) => {
        isInternalChange.current = true
        setDateState((prev) => {
          const year = years[yearIndex]
          return { ...prev, year, day: Math.min(prev.day, getDaysInMonth(year, prev.month)) }
        })
      },
      [years],
    )

    React.useEffect(() => {
      if (!isInternalChange.current) return
      onChange(new Date(dateState.year, dateState.month, dateState.day))
      isInternalChange.current = false
    }, [dateState, onChange])

    React.useEffect(() => {
      if (!value || isInternalChange.current) return
      if (
        value.getDate() !== dateState.day ||
        value.getMonth() !== dateState.month ||
        value.getFullYear() !== dateState.year
      )
        // eslint-disable-next-line react-hooks/set-state-in-effect -- follows the controlled value
        setDateState({
          day: value.getDate(),
          month: value.getMonth(),
          year: value.getFullYear(),
        })
    }, [value, dateState.day, dateState.month, dateState.year])

    const yearIndex = years.indexOf(dateState.year)

    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center justify-center',
          config.gap,
          config.fontSize,
          disabled && 'pointer-events-none opacity-50',
          className,
        )}
        style={{ perspective: '1000px' }}
        role="group"
        aria-label="Data"
        {...props}
      >
        <WheelColumn
          items={days}
          value={dateState.day - 1}
          onChange={handleDayChange}
          itemHeight={config.itemHeight}
          visibleItems={VISIBLE_ITEMS}
          disabled={disabled}
          className="w-12"
          ariaLabel="Dia"
        />
        <WheelColumn
          items={months}
          value={dateState.month}
          onChange={handleMonthChange}
          itemHeight={config.itemHeight}
          visibleItems={VISIBLE_ITEMS}
          disabled={disabled}
          className="w-28 flex-1"
          ariaLabel="Mês"
        />
        <WheelColumn
          items={years}
          value={yearIndex >= 0 ? yearIndex : 0}
          onChange={handleYearChange}
          itemHeight={config.itemHeight}
          visibleItems={VISIBLE_ITEMS}
          disabled={disabled}
          className="w-[4.5rem]"
          ariaLabel="Ano"
        />
      </div>
    )
  },
)

DateWheelPicker.displayName = 'DateWheelPicker'

export { DateWheelPicker }
