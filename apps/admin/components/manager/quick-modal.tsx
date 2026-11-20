'use client'

import { Modal } from '@heroui/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { morphFrom } from './data-kit'
import './appointments/appointments.css'
import './quick-modal.css'

/** Fields that bring up the on-screen keyboard. */
const typingTarget =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="hidden"]), textarea, [contenteditable="true"]'

/**
 * On a phone, the tap that opens the pop-up is often delivered again to whatever field now sits
 * under the finger, and an autofocused field does the same: either way the keyboard opens on
 * its own. Right after opening, a field that takes focus is let go and the dialog keeps it.
 */
function useNoKeyboardOnOpen(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen || !window.matchMedia('(pointer: coarse)').matches) return
    const until = performance.now() + 650
    const onFocus = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || performance.now() > until) return
      const dialog = target.closest<HTMLElement>('.qm')
      if (!dialog || !target.matches(typingTarget)) return
      target.blur()
      dialog.focus({ preventScroll: true })
    }
    document.addEventListener('focusin', onFocus, true)
    const stop = window.setTimeout(
      () => document.removeEventListener('focusin', onFocus, true),
      700,
    )
    return () => {
      window.clearTimeout(stop)
      document.removeEventListener('focusin', onFocus, true)
    }
  }, [isOpen])
}

/**
 * Phones: the sheet follows the area above the keyboard (CSS vars on <html>), and the field being
 * typed in is scrolled into the middle of what is still visible once the keyboard is up.
 */
function useKeyboardAwareSheet(isOpen: boolean) {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!isOpen || !viewport || !window.matchMedia('(pointer: coarse)').matches) return
    const root = document.documentElement
    let field: HTMLElement | null = null
    let timer = 0
    const reveal = () => {
      if (!field || document.activeElement !== field) return
      const body = field.closest<HTMLElement>('.qm-body')
      if (!body) return
      const box = field.getBoundingClientRect()
      const area = body.getBoundingClientRect()
      const top = Math.max(area.top, viewport.offsetTop)
      const bottom = Math.min(area.bottom, viewport.offsetTop + viewport.height)
      // Center the field (with its label) in the visible part of the body.
      const wanted = top + (bottom - top) / 2 - box.height / 2
      if (box.top < top + 8 || box.bottom > bottom - 8)
        body.scrollBy({ top: box.top - wanted, behavior: 'smooth' })
    }
    const sync = () => {
      root.style.setProperty('--qm-vvh', `${Math.round(viewport.height)}px`)
      root.style.setProperty('--qm-vvtop', `${Math.round(viewport.offsetTop)}px`)
      window.clearTimeout(timer)
      timer = window.setTimeout(reveal, 80)
    }
    const onFocus = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || !target.matches(typingTarget)) return
      if (!target.closest('.qm')) return
      field = target.closest<HTMLElement>('.lx-field') ?? target
      // The keyboard may already be up (moving between fields): no resize will come.
      window.clearTimeout(timer)
      timer = window.setTimeout(reveal, 320)
    }
    sync()
    viewport.addEventListener('resize', sync)
    viewport.addEventListener('scroll', sync)
    document.addEventListener('focusin', onFocus, true)
    return () => {
      window.clearTimeout(timer)
      viewport.removeEventListener('resize', sync)
      viewport.removeEventListener('scroll', sync)
      document.removeEventListener('focusin', onFocus, true)
      root.style.removeProperty('--qm-vvh')
      root.style.removeProperty('--qm-vvtop')
    }
  }, [isOpen])
}

/**
 * The panel's standard pop-up: blurred backdrop, roomy on desktop, full-height sheet on phones.
 * Quick actions (novo agendamento, agenda, cliente, horários, ficha do atendimento) open here
 * instead of leaving the page.
 *
 * The look is "glow" (translucent glass, pink/red gradients and neon edges); `tone="plain"` keeps
 * the older flat one. `hero` adds the illustrated side panel (on top, compact, on phones).
 */
export function QuickModal({
  isOpen,
  onOpenChange,
  title,
  subtitle,
  size = 'md',
  footer,
  className,
  morph,
  tone = 'glow',
  badge,
  hero,
  children,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  subtitle?: ReactNode
  /** md ≈ 560px, lg ≈ 780px, xl ≈ 1040px, wide fills the screen (agenda). */
  size?: 'md' | 'lg' | 'xl' | 'wide'
  footer?: ReactNode
  className?: string
  /** Rectangle of the card that opened it: the dialog grows out of that card. */
  morph?: DOMRect | null
  tone?: 'plain' | 'glow'
  /** Small pill above the title (e.g. "Aluguel"). */
  badge?: ReactNode
  /** Illustrated side panel: picture and a few facts about what is being edited. */
  hero?: ReactNode
  children: ReactNode
}) {
  const animated = useRef<DOMRect | null>(null)
  useNoKeyboardOnOpen(isOpen)
  useKeyboardAwareSheet(isOpen)
  const heading = (
    <>
      {badge ? <span className="qm-badge">{badge}</span> : null}
      <Modal.Heading>{title}</Modal.Heading>
    </>
  )
  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      variant="blur"
      className={`qm-back${tone === 'glow' ? ' qm-back-glow' : ''}`}
    >
      <Modal.Container size="lg" scroll="inside" className="qm-container">
        <Modal.Dialog
          className={[
            'manager-dialog',
            'qm',
            `qm-${size}`,
            tone === 'glow' ? 'qm-glow' : '',
            hero ? 'has-hero' : '',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <Modal.CloseTrigger aria-label="Fechar" />
          {morph ? (
            <span
              hidden
              ref={(marker) => {
                // Modal.Dialog takes no ref; this marker finds the dialog once it mounts.
                if (!marker || animated.current === morph) return
                animated.current = morph
                morphFrom(marker.closest<HTMLElement>('[role="dialog"]'), morph)
              }}
            />
          ) : null}
          {hero ? (
            <aside className="qm-hero">
              <div className="qm-hero-head">{heading}</div>
              {hero}
            </aside>
          ) : null}
          <div className="qm-main">
            <Modal.Header className="qm-head">
              {hero ? null : heading}
              {subtitle ? <p className="qm-sub">{subtitle}</p> : null}
            </Modal.Header>
            <Modal.Body className="qm-body lx-scroll">{children}</Modal.Body>
            {footer ? <Modal.Footer className="qm-foot">{footer}</Modal.Footer> : null}
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
