'use client'

import { toast } from '@heroui/react'
import { useEffect } from 'react'

export type NoticeKind = 'success' | 'error' | 'info' | 'warning'

/** A real toast (top center, slides down). Use instead of an inline "saved" ribbon. */
export function showToast(message: string, kind: NoticeKind = 'success') {
  const show =
    kind === 'error'
      ? toast.danger
      : kind === 'warning'
        ? toast.warning
        : kind === 'info'
          ? toast.info
          : toast.success
  show(message, { timeout: kind === 'error' ? 6000 : 4500 })
}

/**
 * Drop-in for the old `notice` ribbons: renders nothing and shows a toast whenever the message
 * changes. A save that keeps the same text twice still toasts, because callers clear it first
 * or the text carries a different detail.
 */
export function ToastNotice({
  message,
  kind,
  onShown,
}: {
  message: string | null | undefined
  /** Defaults to error for "Não foi possível…" texts, success otherwise. */
  kind?: NoticeKind
  /** Clear the message so the same text toasts again next time. */
  onShown?: () => void
}) {
  useEffect(() => {
    if (!message) return
    showToast(
      message,
      kind ?? (/^não (foi|consegu)|^erro|falhou/i.test(message) ? 'error' : 'success'),
    )
    onShown?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per message
  }, [message])
  return null
}
