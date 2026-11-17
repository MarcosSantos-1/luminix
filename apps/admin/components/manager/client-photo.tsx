'use client'

import { Eye } from 'lucide-react'
import { useEffect, useState } from 'react'
import { QuickModal } from './quick-modal'
import type { ClinicApi } from './settings/clinic-api'

// Photos sent through the client area are small JPEGs kept with the account record. They are
// fetched one by one, only for who is on screen, and remembered for the rest of the visit.
const accountPhotos = new Map<string, Promise<string | null>>()

function accountPhoto(api: ClinicApi, clientId: string) {
  let pending = accountPhotos.get(clientId)
  if (!pending) {
    pending = api
      .get<{ photo: string | null }>(`clients/${clientId}/photo`)
      .then((body) => body.photo)
      .catch(() => {
        accountPhotos.delete(clientId)
        return null
      })
    accountPhotos.set(clientId, pending)
  }
  return pending
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')
  ).toUpperCase()
}

/**
 * A person's round photo, or the initials on a soft colour without one. `account` loads the
 * photo the client sent through the client area; `viewable` adds "Ver foto" on hover, which
 * opens the picture enlarged (never use it inside another button).
 */
export function ClientAvatar({
  name,
  photoUrl,
  largeUrl,
  account,
  size = 'md',
  viewable = false,
}: {
  name: string
  photoUrl?: string | null
  /** Bigger copy for the enlarged view; falls back to `photoUrl`. */
  largeUrl?: string | null
  account?: { api: ClinicApi; clientId: string } | null
  size?: 'md' | 'lg'
  viewable?: boolean
}) {
  const [loaded, setLoaded] = useState<{ id: string; photo: string | null } | null>(null)
  const [open, setOpen] = useState(false)
  const accountId = !photoUrl && account ? account.clientId : ''
  const accountApi = account?.api
  useEffect(() => {
    if (!accountId || !accountApi) return
    let active = true
    void accountPhoto(accountApi, accountId).then(
      (photo) => active && setLoaded({ id: accountId, photo }),
    )
    return () => {
      active = false
    }
  }, [accountId, accountApi])

  const src = photoUrl ?? (loaded && loaded.id === accountId ? loaded.photo : null)
  const tone = [...name].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 4
  const className = `apt-avatar apt-avatar-${size} tone-${tone}`
  // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived private URL or data URI
  const picture = src ? <img src={src} alt="" /> : initials(name)

  if (!viewable || !src)
    return (
      <span className={className} aria-hidden>
        {picture}
      </span>
    )
  return (
    <>
      <button
        type="button"
        className={`${className} is-viewable`}
        aria-label={`Ver foto de ${name}`}
        onClick={() => setOpen(true)}
      >
        {picture}
        <span className="apt-avatar-view" aria-hidden>
          <Eye size={size === 'lg' ? 18 : 15} />
          {size === 'lg' ? <small>Ver foto</small> : null}
        </span>
      </button>
      <QuickModal isOpen={open} onOpenChange={setOpen} title={name} className="photo-view">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL or data URI */}
        <img className="photo-view-image" src={largeUrl ?? src} alt={`Foto de ${name}`} />
      </QuickModal>
    </>
  )
}
