'use client'

import { useRouter } from 'next/navigation'
import { SlidersHorizontal } from 'lucide-react'

const themes = [
  ['rosa', 'Rosa'],
  ['grafite', 'Grafite'],
  ['esmeralda', 'Esmeralda'],
  ['dourado', 'Dourado'],
  ['azul', 'Azul'],
  ['violeta', 'Violeta'],
] as const

export function ClinicDemoDebugger({
  slug,
  theme,
  options,
}: {
  slug: string
  theme: string
  options: { slug: string; label: string }[]
}) {
  const router = useRouter()

  return (
    <details className="clinic-demo-debugger">
      <summary>
        <SlidersHorizontal size={16} aria-hidden /> Prévia de estilos
      </summary>
      <div>
        <label>
          Categoria
          <select
            value={slug}
            onChange={(event) => router.push(`/c/${encodeURIComponent(event.target.value)}`)}
          >
            {options.map((option) => (
              <option key={option.slug} value={option.slug}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tema
          <select
            value={theme}
            onChange={(event) =>
              router.replace(
                `/c/${encodeURIComponent(slug)}?tema=${encodeURIComponent(event.target.value)}`,
                { scroll: false },
              )
            }
          >
            {themes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </details>
  )
}
