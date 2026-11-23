'use client'

import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react'

/**
 * What the business calls itself: Studio, Clínica, Salão, SPA or Espaço. It goes in front of
 * the name ("Studio Luniere") and replaces the generic "sua clínica" / "seu espaço" in the copy.
 */
export const spaceKinds = [
  { id: 'studio', label: 'Studio' },
  { id: 'clinica', label: 'Clínica' },
  { id: 'salao', label: 'Salão' },
  { id: 'spa', label: 'SPA' },
  { id: 'espaco', label: 'Espaço' },
] as const
export type SpaceKind = (typeof spaceKinds)[number]['id']

export function isSpaceKind(value: unknown): value is SpaceKind {
  return spaceKinds.some((kind) => kind.id === value)
}

const nouns: Record<SpaceKind, { noun: string; feminine: boolean }> = {
  studio: { noun: 'Studio', feminine: false },
  clinica: { noun: 'clínica', feminine: true },
  salao: { noun: 'salão', feminine: false },
  spa: { noun: 'SPA', feminine: false },
  espaco: { noun: 'espaço', feminine: false },
}

export function spaceKindLabel(kind: SpaceKind) {
  return spaceKinds.find((item) => item.id === kind)?.label ?? 'Espaço'
}

/** "Luniere" + studio → "Studio Luniere"; a name that already starts with the label is kept. */
export function spaceDisplayName(kind: SpaceKind | null | undefined, name: string) {
  const plain = name.trim()
  if (!kind || !plain) return plain
  const label = spaceKindLabel(kind)
  const lower = plain.toLocaleLowerCase('pt-BR')
  const prefix = label.toLocaleLowerCase('pt-BR')
  return lower === prefix || lower.startsWith(`${prefix} `) ? plain : `${label} ${plain}`
}

// Determiner pairs (feminine, masculine) found before "clínica" / "espaço" in the copy.
const determiners: [string, string][] = [
  ['sua', 'seu'],
  ['da', 'do'],
  ['na', 'no'],
  ['pela', 'pelo'],
  ['à', 'ao'],
  ['uma', 'um'],
  ['nesta', 'neste'],
  ['desta', 'deste'],
  ['esta', 'este'],
  ['a', 'o'],
]
const byWord = new Map<string, [string, string]>()
for (const pair of determiners) for (const word of pair) byWord.set(word, pair)
const pattern = new RegExp(
  `(?<![\\p{L}])(${[...byWord.keys()].join('|')}) (clínica|espaço|estúdio|studio|salão|spa)(?![\\p{L}])`,
  'giu',
)

function matchCase(source: string, value: string) {
  return source[0] === source[0].toLocaleUpperCase('pt-BR')
    ? value[0].toLocaleUpperCase('pt-BR') + value.slice(1)
    : value
}

/**
 * Rewrites generic copy for the chosen kind: "Como seu espaço se chama?" → "Como seu Studio se
 * chama?", "O que a clínica oferece?" → "O que o salão oferece?". Without a kind, unchanged.
 */
export function adaptSpaceCopy(text: string, kind: SpaceKind | null | undefined) {
  if (!kind || !text) return text
  const { noun, feminine } = nouns[kind]
  return text.replace(pattern, (_match, word: string) => {
    const pair = byWord.get(word.toLocaleLowerCase('pt-BR'))
    if (!pair) return _match
    return `${matchCase(word, feminine ? pair[0] : pair[1])} ${noun}`
  })
}

const Context = createContext<SpaceKind | null>(null)

export function SpaceKindProvider({
  kind,
  children,
}: {
  kind: SpaceKind | null | undefined
  children: ReactNode
}) {
  return <Context.Provider value={kind ?? null}>{children}</Context.Provider>
}

export function useSpaceKind() {
  return useContext(Context)
}

/** `copy("Salve as fotos da clínica")` → "Salve as fotos do Studio". */
export function useSpaceCopy() {
  const kind = useContext(Context)
  return useCallback((text: string) => adaptSpaceCopy(text, kind), [kind])
}

// Text typed by people (fields) and code stay as they are.
const skipped =
  'input, textarea, select, script, style, code, pre, [contenteditable], [data-no-space-copy]'
const attributes = ['placeholder', 'aria-label', 'title'] as const

function adaptNode(node: Node, kind: SpaceKind) {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement
    if (!parent || parent.closest(skipped)) return
    const next = adaptSpaceCopy(node.nodeValue ?? '', kind)
    if (next !== node.nodeValue) node.nodeValue = next
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const element = node as Element
  if (element.closest('script, style, [data-no-space-copy]')) return
  for (const name of attributes) {
    const value = element.getAttribute(name)
    if (value) {
      const next = adaptSpaceCopy(value, kind)
      if (next !== value) element.setAttribute(name, next)
    }
  }
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      for (const name of attributes) {
        const value = (current as Element).getAttribute(name)
        if (value) {
          const next = adaptSpaceCopy(value, kind)
          if (next !== value) (current as Element).setAttribute(name, next)
        }
      }
    } else adaptNode(current, kind)
  }
}

/**
 * Applies the wording of the space kind to the whole page while mounted, modals included: the
 * panel keeps its generic copy ("sua clínica", "seu espaço") and people read "seu Studio".
 * Only rewrites text the app rendered; React replaces it on the next update and it is adapted
 * again. Mark user content that must stay verbatim with `data-no-space-copy`.
 */
export function SpaceCopyEffect({ kind }: { kind: SpaceKind | null | undefined }) {
  useEffect(() => {
    if (!kind || typeof MutationObserver === 'undefined') return
    adaptNode(document.body, kind)
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') adaptNode(record.target, kind)
        else if (record.type === 'attributes') adaptNode(record.target, kind)
        else record.addedNodes.forEach((node) => adaptNode(node, kind))
      }
    })
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...attributes],
    })
    return () => observer.disconnect()
  }, [kind])
  return null
}
