'use client'

import { Label, Slider } from '@heroui/react'
import { Blend, Droplets, Layers2, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import {
  useState,
  useSyncExternalStore,
  type ComponentPropsWithRef,
  type CSSProperties,
  type RefObject,
} from 'react'
import './home-glass.css'

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
  { label: 'Fosco', icon: Layers2, values: { opacity: 85, blur: 32, saturation: 90, edge: 24 } },
]

function readGlass(key?: string): Glass | null {
  if (!key) return null
  try {
    const item = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (!item || typeof item.tint !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.tint)) return null
    return controls.every(
      ({ key, min, max }) => Number.isFinite(item[key]) && item[key] >= min && item[key] <= max,
    )
      ? item
      : null
  } catch {
    return null
  }
}

// React uses the server snapshot during hydration, including when local preferences already exist.
const subscribeHydration = () => () => {}
const hydrated = () => true
const server = () => false

export function HomeGlassShell({
  enabled,
  scope,
  panelRef,
  children,
  ...shell
}: ComponentPropsWithRef<'div'> & {
  enabled: boolean
  scope?: string
  panelRef: RefObject<HTMLDivElement | null>
}) {
  const storageKey = scope ? `luminix.home-glass.v1/${scope}` : undefined
  const ready = useSyncExternalStore(subscribeHydration, hydrated, server)
  const [glass, setGlass] = useState(() =>
    typeof window === 'undefined' ? null : readGlass(storageKey),
  )
  const active = enabled && ready && glass
  const value = active || initial
  function change(next: Glass | null) {
    setGlass(next)
    if (!storageKey) return
    try {
      if (next) localStorage.setItem(storageKey, JSON.stringify(next))
      else localStorage.removeItem(storageKey)
    } catch {
      // The preview remains usable when the browser disables storage.
    }
  }
  const style = active
    ? ({
        '--home-tint': active.tint,
        '--home-opacity': `${active.opacity}%`,
        '--home-blur': `${active.blur}px`,
        '--home-saturation': `${active.saturation}%`,
        '--home-edge': `${Math.round(active.edge * 0.65)}%`,
      } as CSSProperties)
    : undefined
  return (
    <div {...shell} data-home-glass={active ? 'custom' : undefined} style={style}>
      {children}
      {enabled && (
        <div
          id="home-glass-panel"
          ref={panelRef}
          className="home-glass-editor"
          popover="auto"
          role="dialog"
          aria-labelledby="home-glass-title"
        >
          <header>
            <SlidersHorizontal size={20} aria-hidden />
            <h2 id="home-glass-title">Ajustar design</h2>
            <button
              type="button"
              popoverTarget="home-glass-panel"
              popoverTargetAction="hide"
              aria-label="Fechar ajustes"
            >
              <X size={18} />
            </button>
          </header>
          <div className="home-glass-presets" role="group" aria-label="Estilos de vidro">
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
          <div className="home-glass-sliders">
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
                <div className="home-glass-scale">
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
          <label className="home-glass-color">
            Cor do vidro
            <input
              type="color"
              value={value.tint}
              onChange={(event) => change({ ...value, tint: event.target.value })}
            />
          </label>
          <button
            className="home-glass-reset"
            type="button"
            disabled={!active}
            onClick={() => change(null)}
          >
            <RotateCcw size={15} aria-hidden />
            Restaurar padrão
          </button>
        </div>
      )}
    </div>
  )
}
