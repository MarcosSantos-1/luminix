'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'

type Tone = 'success' | 'info' | 'error'
type Toast = { id: number; tone: Tone; title: string; body?: string }

// One queue for the whole client area: pages call `toast.*`, the shell renders <Toaster />.
let queue: Toast[] = []
let next = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

function push(tone: Tone, title: string, body?: string) {
  const id = next++
  // At most three at a time; the oldest leaves first.
  queue = [...queue.slice(-2), { id, tone, title, body }]
  emit()
  return id
}
function dismiss(id: number) {
  queue = queue.filter((item) => item.id !== id)
  emit()
}

export const toast = {
  success: (title: string, body?: string) => push('success', title, body),
  info: (title: string, body?: string) => push('info', title, body),
  error: (title: string, body?: string) => push('error', title, body),
  dismiss,
}

const icons = { success: CircleCheck, info: Info, error: CircleAlert }

function Item({ item }: { item: Toast }) {
  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), item.tone === 'error' ? 7000 : 5000)
    return () => clearTimeout(timer)
  }, [item.id, item.tone])
  const Icon = icons[item.tone]
  return (
    <div
      className="ca-toast"
      data-tone={item.tone}
      role={item.tone === 'error' ? 'alert' : 'status'}
    >
      <Icon size={20} aria-hidden />
      <div>
        <strong>{item.title}</strong>
        {item.body ? <p>{item.body}</p> : null}
      </div>
      <button type="button" aria-label="Fechar aviso" onClick={() => dismiss(item.id)}>
        <X size={16} aria-hidden />
      </button>
    </div>
  )
}

export function Toaster() {
  const items = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => queue,
    () => queue,
  )
  return (
    <div className="ca-toaster" aria-live="polite">
      {items.map((item) => (
        <Item key={item.id} item={item} />
      ))}
    </div>
  )
}
