'use client'

import { Label, Slider } from '@heroui/react'
import {
  Blend,
  Droplets,
  Layers2,
  Palette,
  ChevronDown,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import {
  useMemo,
  useEffect,
  useSyncExternalStore,
  type ComponentPropsWithRef,
  type CSSProperties,
  type Ref,
} from 'react'
import { ThemePicker } from '@/components/space-theme'
import { spaceThemes, type SpaceTheme } from '@/lib/space-theme'
import './manager-appearance.css'

const controls = [
  { key: 'opacity', label: 'Opacidade', min: 10, max: 90, unit: '%' },
  { key: 'blur', label: 'Desfoque', min: 0, max: 40, unit: ' px' },
  { key: 'saturation', label: 'Saturação', min: 50, max: 180, unit: '%' },
  { key: 'edge', label: 'Brilho da borda', min: 0, max: 100, unit: '%' },
] as const
type Glass = Record<(typeof controls)[number]['key'], number> & { tint: string }
const initial: Glass = { opacity: 46, blur: 20, saturation: 120, edge: 38, tint: '#bc7398' }
const presets = [
  { label: 'Cristal', icon: Droplets, values: { opacity: 18, blur: 8, saturation: 120, edge: 75 } },
  { label: 'Acetinado', icon: Blend, values: { opacity: 46, blur: 20, saturation: 135, edge: 42 } },
  {
    label: 'Fosco',
    icon: Layers2,
    values: { opacity: 85, blur: 32, saturation: 90, edge: 24 },
  },
]

type Appearance = { glass: Glass | null; theme: SpaceTheme | null }
const deviceKey = 'luminix.admin.appearance.v1'
const defaults: Appearance = { glass: null, theme: null }
let temporary: string | null = null

function parseAppearance(raw: string | null): Appearance {
  try {
    const item = JSON.parse(raw ?? 'null')
    const glass = item?.glass
    const valid =
      glass &&
      typeof glass.tint === 'string' &&
      /^#[0-9a-f]{6}$/i.test(glass.tint) &&
      controls.every(
        ({ key, min, max }) =>
          Number.isFinite(glass[key]) && glass[key] >= min && glass[key] <= max,
      )
    return {
      glass: valid ? glass : null,
      theme: spaceThemes.find(({ id }) => id === item?.theme)?.id ?? null,
    }
  } catch {
    return defaults
  }
}

function snapshot() {
  if (temporary !== null) return temporary
  try {
    return localStorage.getItem(deviceKey)
  } catch {
    return null
  }
}
const serverSnapshot = () => null
function subscribe(notify: () => void) {
  const sync = (event: StorageEvent) => {
    if (event.key === deviceKey || event.key === null) {
      temporary = null
      notify()
    }
  }
  window.addEventListener('storage', sync)
  window.addEventListener(deviceKey, notify)
  return () => {
    window.removeEventListener('storage', sync)
    window.removeEventListener(deviceKey, notify)
  }
}
function save(value: Appearance) {
  const raw = JSON.stringify(value)
  try {
    localStorage.setItem(deviceKey, raw)
    temporary = null
  } catch {
    temporary = raw
  }
  window.dispatchEvent(new Event(deviceKey))
}

export function ManagerDesignButton() {
  return (
    <button
      type="button"
      className="manager-design-trigger"
      popoverTarget="manager-glass-panel"
      title="Ajustar design"
    >
      <SlidersHorizontal size={18} aria-hidden />
      <span>Ajustar design</span>
    </button>
  )
}

export function ManagerAppearanceShell({
  legacyScope,
  panelRef,
  children,
  ...shell
}: ComponentPropsWithRef<'div'> & {
  legacyScope?: string
  panelRef?: Ref<HTMLDivElement>
}) {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  const appearance = useMemo(() => parseAppearance(raw), [raw])
  const { glass: active, theme } = appearance
  const value = active ?? initial

  useEffect(() => {
    if (!legacyScope || snapshot() !== null) return
    try {
      const old = localStorage.getItem(`luminix.home-glass.v1/${legacyScope}`)
      if (old) {
        const migrated = parseAppearance(JSON.stringify({ glass: JSON.parse(old) }))
        if (migrated.glass) save(migrated)
      }
    } catch {
      /* Invalid or unavailable legacy storage. */
    }
  }, [legacyScope])

  // The overlay portals live under body. Scope their palette to the lifetime of the manager.
  useEffect(() => {
    if (!theme) return
    document.body.dataset.managerPalette = theme
    return () => {
      delete document.body.dataset.managerPalette
    }
  }, [theme])

  function change(glass: Glass) {
    save({ ...appearance, glass })
  }
  const style = active
    ? ({
        '--manager-glass-tint': active.tint,
        '--manager-glass-opacity': `${active.opacity}%`,
        '--manager-glass-blur': `${active.blur}px`,
        '--manager-glass-saturation': `${active.saturation}%`,
        '--manager-glass-edge': `${Math.round(active.edge * 0.65)}%`,
      } as CSSProperties)
    : undefined
  return (
    <div {...shell} data-manager-glass={active ? 'custom' : undefined} style={style}>
      {children}
      <div
        id="manager-glass-panel"
        ref={panelRef}
        className="manager-glass-editor"
        popover="auto"
        role="dialog"
        aria-labelledby="manager-glass-title"
      >
        <header>
          <SlidersHorizontal size={20} aria-hidden />
          <h2 id="manager-glass-title">Ajustar design</h2>
          <button
            type="button"
            popoverTarget="manager-glass-panel"
            popoverTargetAction="hide"
            aria-label="Fechar ajustes"
          >
            <X size={18} />
          </button>
        </header>
        <details className="manager-palette-picker">
          <summary>
            <Palette size={16} aria-hidden />
            Alterar tema do painel
            <ChevronDown size={15} aria-hidden />
          </summary>
          <ThemePicker
            value={theme}
            onChange={(next) => save({ ...appearance, theme: next })}
            label="Tema do painel neste dispositivo"
          />
        </details>
        <div className="manager-glass-presets" role="group" aria-label="Estilos de vidro">
          {presets.map(({ label, icon: Icon, values }) => (
            <button
              key={label}
              type="button"
              aria-pressed={!!active && controls.every(({ key }) => active[key] === values[key])}
              onClick={() => change({ ...value, ...values })}
            >
              <Icon size={17} aria-hidden />
              {label}
            </button>
          ))}
        </div>
        <div className="manager-glass-sliders">
          {controls.map(({ key, label, unit, min, max }) => (
            <Slider
              key={key}
              value={value[key]}
              minValue={min}
              maxValue={max}
              onChange={(number) => {
                if (typeof number === 'number') change({ ...value, [key]: number })
              }}
            >
              <div className="manager-glass-scale">
                <Label>{label}</Label>
                <Slider.Output>
                  {value[key]}
                  {unit}
                </Slider.Output>
              </div>
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
          ))}
        </div>
        <label className="manager-glass-color">
          Cor do vidro
          <input
            type="color"
            value={value.tint}
            onChange={(event) => change({ ...value, tint: event.target.value })}
          />
        </label>
        <button
          className="manager-glass-reset"
          type="button"
          disabled={!active && !theme}
          onClick={() => save(defaults)}
        >
          <RotateCcw size={15} aria-hidden />
          Restaurar padrão
        </button>
      </div>
    </div>
  )
}
