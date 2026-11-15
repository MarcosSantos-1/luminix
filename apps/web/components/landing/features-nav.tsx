'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import type { FeatureGroup } from '../../lib/features'

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Menu lateral da documentação: busca, grupos e destaque do tópico visível. */
export function FeaturesNav({ groups }: { groups: FeatureGroup[] }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(groups[0]?.features[0]?.id ?? '')
  const detailsRef = useRef<HTMLDetailsElement>(null)

  const filtered = useMemo(() => {
    const term = normalize(query.trim())
    if (!term) return groups
    return groups
      .map((group) => ({
        ...group,
        features: group.features.filter((feature) =>
          normalize(`${feature.title} ${feature.summary} ${feature.points.join(' ')}`).includes(
            term,
          ),
        ),
      }))
      .filter((group) => group.features.length > 0)
  }, [groups, query])

  useEffect(() => {
    const sections = groups
      .flatMap((group) => group.features)
      .map((feature) => document.getElementById(feature.id))
      .filter((element): element is HTMLElement => element !== null)

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActive(visible.target.id)
      },
      { rootMargin: '-20% 0px -65% 0px' },
    )
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [groups])

  // No desktop o menu fica sempre aberto; no celular começa recolhido.
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 960px)')
    const sync = () => {
      if (detailsRef.current) detailsRef.current.open = wide.matches
    }
    sync()
    wide.addEventListener('change', sync)
    return () => wide.removeEventListener('change', sync)
  }, [])

  const activeTitle = groups.flatMap((g) => g.features).find((f) => f.id === active)?.title

  return (
    <details className="docs-nav" ref={detailsRef}>
      <summary>
        <span>
          <small>Nesta página</small>
          {activeTitle}
        </span>
        <ChevronDown size={18} aria-hidden />
      </summary>
      <div className="docs-nav-body">
        <label className="docs-search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            placeholder="Buscar funcionalidade"
            aria-label="Buscar funcionalidade"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <nav aria-label="Funcionalidades">
          {filtered.length === 0 && <p className="docs-empty">Nada encontrado.</p>}
          {filtered.map((group) => (
            <div key={group.title}>
              <h2>{group.title}</h2>
              <ul>
                {group.features.map((feature) => (
                  <li key={feature.id}>
                    <a
                      href={`#${feature.id}`}
                      aria-current={active === feature.id ? 'true' : undefined}
                      onClick={() => {
                        setActive(feature.id)
                        if (detailsRef.current && window.innerWidth < 960) {
                          detailsRef.current.open = false
                        }
                      }}
                    >
                      {feature.title}
                      {feature.status === 'em-breve' && <i>em breve</i>}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </details>
  )
}
