'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Mail } from 'lucide-react'
import type { SocialProvider } from '@/hooks/use-staff-auth'

/** Google and Apple, same order and marks as the client app; the e-mail form follows the divider. */
export function SocialButtons({
  busy = false,
  onSelect,
  onEmail,
  note,
  error,
}: {
  busy?: boolean
  onSelect: (kind: SocialProvider) => Promise<unknown> | void
  /** Given: e-mail is one more button that opens its form; absent, the form follows inline. */
  onEmail?: () => void
  /** Shown under the buttons (e.g. the terms on sign-up). */
  note?: ReactNode
  error?: string
}) {
  const [opening, setOpening] = useState<SocialProvider | null>(null)

  async function choose(kind: SocialProvider) {
    setOpening(kind)
    try {
      await onSelect(kind)
    } finally {
      setOpening(null)
    }
  }

  const disabled = busy || opening !== null
  return (
    <div className="auth-social">
      <button
        type="button"
        className="auth-social-button is-google"
        disabled={disabled}
        onClick={() => void choose('google')}
      >
        <GoogleMark />
        {opening === 'google' ? 'Abrindo o Google…' : 'Continuar com Google'}
      </button>
      <button
        type="button"
        className="auth-social-button is-apple"
        disabled={disabled}
        onClick={() => void choose('apple')}
      >
        <AppleMark />
        {opening === 'apple' ? 'Abrindo a Apple…' : 'Continuar com Apple'}
      </button>
      {onEmail ? (
        <>
          <p className="auth-social-or">
            <span>ou</span>
          </p>
          <button
            type="button"
            className="auth-social-button is-email"
            disabled={disabled}
            onClick={onEmail}
          >
            <Mail size={20} aria-hidden />
            Continuar com e-mail
          </button>
        </>
      ) : null}
      {error ? (
        <p className="auth-social-error" role="alert">
          {error}
        </p>
      ) : null}
      {note ? <p className="auth-social-note">{note}</p> : null}
      {onEmail ? null : (
        <p className="auth-social-or">
          <span>ou com e-mail</span>
        </p>
      )}
    </div>
  )
}

/**
 * Big desktop screens (1080p and up) have room for the e-mail form next to Google/Apple; smaller
 * ones keep it behind "Continuar com e-mail", like the client app. False until mounted.
 */
export function useRoomyScreen() {
  const [roomy, setRoomy] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1280px) and (min-height: 800px)')
    const update = () => setRoomy(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return roomy
}

/** Back from the e-mail form to Google/Apple. */
export function OtherWays({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="auth-other-ways" onClick={onClick}>
      Outras formas de entrar
    </button>
  )
}

/** Google's "G", in its own four colors (brand guidelines: never recolored). */
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  )
}

/** Apple's mark, in the button's text color. */
function AppleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 384 512" aria-hidden fill="currentColor">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  )
}
