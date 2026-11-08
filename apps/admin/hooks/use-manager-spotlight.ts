'use client'

import { useEffect, type RefObject } from 'react'

/** Marks a control by its data-manager-spotlight key and leaves only it and the guide interactive. */
export function useManagerSpotlight(
  root: RefObject<HTMLElement | null>,
  target: string | undefined,
) {
  useEffect(() => {
    const container = root.current
    if (!container || !target) return
    const targetKey = target
    const blocked = new Set<HTMLElement>()
    let highlighted: HTMLElement | undefined

    function restore(element: HTMLElement) {
      element.inert = false
      element.removeAttribute('data-spotlight-muted')
    }

    function update() {
      if (!container) return
      const find = (key: string) =>
        Array.from(
          container.querySelectorAll<HTMLElement>(`[data-manager-spotlight="${CSS.escape(key)}"]`),
        ).find((element) => element.getClientRects().length > 0)
      const focus = find(targetKey) ?? find('section-heading')
      const guide = find('guide')
      if (!focus || !guide) return

      const activePaths = new Set<HTMLElement>()
      for (const anchor of [focus, guide]) {
        for (
          let node: HTMLElement | null = anchor;
          node && node !== container;
          node = node.parentElement
        )
          activePaths.add(node)
      }
      const nextBlocked = new Set<HTMLElement>()
      for (const node of activePaths) {
        for (const sibling of node.parentElement?.children ?? []) {
          if (sibling instanceof HTMLElement && !activePaths.has(sibling)) nextBlocked.add(sibling)
        }
      }
      for (const node of blocked) {
        if (nextBlocked.has(node)) continue
        restore(node)
        blocked.delete(node)
      }
      for (const node of nextBlocked) {
        if (node.inert) continue
        node.inert = true
        node.setAttribute('data-spotlight-muted', '')
        blocked.add(node)
      }
      if (highlighted === focus) return
      highlighted?.removeAttribute('data-spotlight-current')
      highlighted = focus
      focus.setAttribute('data-spotlight-current', '')
      const targetRect = focus.getBoundingClientRect()
      if (targetRect.top < 10 || targetRect.bottom > guide.getBoundingClientRect().top - 16)
        focus.scrollIntoView({ block: 'center', behavior: 'instant' })
    }

    const observer = new MutationObserver(update)
    observer.observe(container, { childList: true, subtree: true })
    window.addEventListener('resize', update)
    update()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      highlighted?.removeAttribute('data-spotlight-current')
      blocked.forEach(restore)
    }
  }, [root, target])
}
