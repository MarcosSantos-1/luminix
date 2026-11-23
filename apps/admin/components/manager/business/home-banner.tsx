'use client'

import { Button } from '@heroui/react'
import { X, type LucideIcon } from 'lucide-react'

/**
 * A glossy card for "Informações importantes": title, one line, a button and an illustration on
 * the right. Colours follow the space theme (`--space-accent` / `--space-highlight`).
 */
export function HomeBanner({
  title,
  text,
  action,
  art,
  icon: Icon,
  onDismiss,
}: {
  title: string
  text: string
  action: { label: string; onPress: () => void }
  /** Picture from /public (e.g. the megaphone); otherwise `icon` is drawn as a 3D-like badge. */
  art?: string
  icon?: LucideIcon
  onDismiss?: () => void
}) {
  return (
    <article className="home-banner">
      <div className="home-banner-copy">
        <h3>{title}</h3>
        <p>{text}</p>
        <Button size="sm" className="home-banner-action" onPress={action.onPress}>
          {action.label}
        </Button>
      </div>
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element -- small static illustration
        <img className="home-banner-art" src={art} alt="" aria-hidden />
      ) : Icon ? (
        <span className="home-banner-glyph" aria-hidden>
          <Icon size={34} strokeWidth={1.6} />
        </span>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          className="home-banner-close"
          aria-label="Dispensar"
          onClick={onDismiss}
        >
          <X size={18} aria-hidden />
        </button>
      ) : null}
    </article>
  )
}
