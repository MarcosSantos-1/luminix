'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { updateProfile } from 'firebase/auth'
import { AppStatus } from '@/components/app-status'
import {
  ContactSteps,
  contactComplete,
  isRelayEmail,
  type ContactDetails,
} from '@/components/auth/contact-steps'
import SignUpPage from '@/components/auth/sign-up'
import { useStaff, type StaffClinic } from '@/components/staff-provider'
import { useStaffAuth } from '@/hooks/use-staff-auth'
import { bootstrapOwnerClinic } from '@/lib/owner-clinic'
import { awaitsOnboarding, clinicRef, staffHomePath } from '@/lib/staff-destination'

type DraftPayload = {
  ownerName?: string
  email?: string
  phone?: string
  clinic?: Record<string, unknown>
  professionals?: Record<string, unknown>[]
  [key: string]: unknown
}
type Draft = { version: number; step: string; payload: DraftPayload }

/** The GET adds display-only URLs that the PUT schema does not accept. */
function payloadForSave(payload: DraftPayload, contact: ContactDetails): DraftPayload {
  const clinic = { ...(payload.clinic ?? {}) }
  delete clinic.logoUrl
  if (!clinic.whatsapp) clinic.whatsapp = contact.phone
  return {
    ...payload,
    ownerName: contact.name,
    phone: contact.phone,
    email: contact.email,
    clinic,
    professionals: (payload.professionals ?? []).map((person) => {
      const persisted = { ...person }
      delete persisted.photoUrl
      delete persisted.photoPreview
      return persisted
    }),
  }
}

export default function CadastroPage() {
  const staff = useStaff()
  const router = useRouter()
  const auth = useStaffAuth()
  const [asking, setAsking] = useState<{ clinic: StaffClinic; draft: Draft } | null>(null)
  const [initial, setInitial] = useState<ContactDetails | null>(null)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState('')
  const started = useRef<string | null>(null)

  // Signed in: make sure her draft space exists, then ask only what is still missing.
  useEffect(() => {
    const user = staff.user
    if (!user || staff.loading || staff.error) return
    if (!awaitsOnboarding(staff.clinics) || staff.clinics.length > 1) {
      router.replace(staffHomePath(staff.clinics) ?? '/')
      return
    }
    const key = `${user.uid}:${staff.clinics[0]?.id ?? 'none'}`
    if (started.current === key) return
    started.current = key
    void (async () => {
      try {
        if (staff.clinics.length === 0) {
          await bootstrapOwnerClinic(user)
          staff.refresh()
          return
        }
        const clinic = staff.clinics[0]
        const onboarding = `/c/${clinicRef(clinic)}/onboarding`
        const response = await fetch(`/api/clinics/${clinic.id}/onboarding`, {
          headers: { authorization: `Bearer ${await user.getIdToken()}` },
          cache: 'no-store',
          signal: AbortSignal.timeout(20_000),
        })
        // Without the draft (e.g. no onboarding permission) the onboarding handles it.
        if (!response.ok) return router.replace(onboarding)
        const { draft } = (await response.json()) as { draft: Draft }
        const accountEmail = user.email && !isRelayEmail(user.email) ? user.email : ''
        const prefill: ContactDetails = {
          name: draft.payload.ownerName?.trim() || user.displayName?.trim() || '',
          phone: draft.payload.phone ?? '',
          email: draft.payload.email?.trim() || accountEmail,
        }
        if (draft.payload.phone && contactComplete(prefill)) return router.replace(onboarding)
        setInitial(prefill)
        setAsking({ clinic, draft })
      } catch {
        started.current = null
        setProblem('Não foi possível abrir seu cadastro. Tente novamente.')
      }
    })()
  }, [staff, router])

  async function finish(contact: ContactDetails) {
    const user = staff.user
    if (!user || !asking) return
    setSaving(true)
    setProblem('')
    try {
      const response = await fetch(`/api/clinics/${asking.clinic.id}/onboarding`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${await user.getIdToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: asking.draft.version,
          step: asking.draft.step,
          payload: payloadForSave(asking.draft.payload, contact),
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) throw new Error('Unavailable')
      if (!user.displayName?.trim()) await updateProfile(user, { displayName: contact.name })
      router.replace(`/c/${clinicRef(asking.clinic)}/onboarding`)
    } catch {
      setSaving(false)
      setProblem('Não foi possível salvar agora. Confira a conexão e tente de novo.')
    }
  }

  if (staff.user && !staff.error) {
    if (asking && initial)
      return <ContactSteps initial={initial} busy={saving} error={problem} onFinish={finish} />
    return (
      <AppStatus
        scene="entry"
        alert={Boolean(problem)}
        action={
          problem ? (
            <button type="button" onClick={() => window.location.reload()}>
              Tentar novamente
            </button>
          ) : undefined
        }
      >
        {problem || undefined}
      </AppStatus>
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await auth.signUp(String(data.get('email') ?? ''), String(data.get('password') ?? ''))
  }

  return (
    <SignUpPage
      busy={auth.busy}
      error={auth.error || staff.error}
      message={auth.message}
      onSubmit={submit}
      onSocial={auth.social}
    />
  )
}
