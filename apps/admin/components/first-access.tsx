'use client'

import { updatePassword } from 'firebase/auth'
import { Camera, Check, Eye, EyeOff } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { squarePhoto } from '@/components/manager/account-modal'
import { useClinicApi } from '@/components/manager/settings/clinic-api'
import type { StaffClinic } from '@/components/staff-provider'
import { roleLabel } from '@/lib/access'
import { getFirebaseAuth } from '@/lib/firebase'

export type FirstAccessStep = 'password' | 'photo' | 'welcome'
const steps: FirstAccessStep[] = ['password', 'photo', 'welcome']

/** Card with the step dots; the steps below go inside it. */
export function FirstAccessCard({
  step,
  children,
}: {
  step: FirstAccessStep
  children: ReactNode
}) {
  const current = steps.indexOf(step)
  return (
    <section className="first-access" aria-live="polite">
      <ol className="first-access-steps" aria-label="Etapas do primeiro acesso">
        {steps.map((item, index) => (
          <li
            key={item}
            className={index === current ? 'is-current' : current > index ? 'is-done' : undefined}
          >
            {current > index ? <Check size={14} aria-hidden /> : index + 1}
          </li>
        ))}
      </ol>
      {children}
    </section>
  )
}

export function PasswordStep({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password.length < 8) {
      setError('Use pelo menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('As duas senhas não são iguais.')
      return
    }
    const user = getFirebaseAuth().currentUser
    if (!user) return
    setBusy(true)
    setError('')
    try {
      await updatePassword(user, password)
      onDone()
    } catch (caught) {
      const code = (caught as { code?: string }).code
      setError(
        code === 'auth/requires-recent-login'
          ? 'Por segurança, abra de novo o link do convite e crie a senha logo em seguida.'
          : code === 'auth/weak-password'
            ? 'Essa senha é fraca. Tente uma mais longa.'
            : 'Não foi possível salvar a senha. Tente de novo.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="email-link-form" onSubmit={(event) => void save(event)}>
      <h1>Crie a sua senha</h1>
      <p>Nas próximas vezes você entra com o seu e-mail e esta senha.</p>
      <label className="first-access-field">
        <span>Senha</span>
        <span className="first-access-password">
          <input
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            type="button"
            className="first-access-eye"
            aria-label={show ? 'Esconder senha' : 'Mostrar senha'}
            onClick={() => setShow(!show)}
          >
            {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
          </button>
        </span>
      </label>
      <label className="first-access-field">
        <span>Confirme a senha</span>
        <input
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          minLength={8}
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </label>
      <small className="first-access-hint">Pelo menos 8 caracteres.</small>
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit" disabled={busy}>
        {busy ? 'Salvando…' : 'Salvar senha'}
      </button>
    </form>
  )
}

export function PhotoStep({ clinicId, onDone }: { clinicId: string; onDone: () => void }) {
  const api = useClinicApi(clinicId)
  const input = useRef<HTMLInputElement>(null)
  const [account, setAccount] = useState<{ name: string; photo: string | null } | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    void api
      .get<{ name: string; photo: string | null }>('account')
      .then((data) => {
        if (!active) return
        setAccount(data)
        setPhoto(data.photo)
      })
      .catch(() => active && setError('Não foi possível carregar a sua conta.'))
    return () => {
      active = false
    }
  }, [api])

  async function pick(file: File | undefined) {
    if (!file) return
    setError('')
    try {
      setPhoto(await squarePhoto(file))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível usar esta imagem.')
    }
  }

  async function save() {
    if (!account || !photo || photo === account.photo) {
      onDone()
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.put('account', { name: account.name, photo })
      onDone()
    } catch {
      setError('Não foi possível salvar a foto. Tente de novo ou pule por agora.')
    } finally {
      setBusy(false)
    }
  }

  const initial = (account?.name || '?').slice(0, 1).toUpperCase()
  return (
    <div className="email-link-form">
      <h1>Coloque a sua foto</h1>
      <p>É assim que a equipe vê você no painel. Dá para trocar depois em “Minha conta”.</p>
      <button
        type="button"
        className="first-access-photo"
        onClick={() => input.current?.click()}
        aria-label={photo ? 'Trocar foto' : 'Escolher foto'}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- local data URI preview
          <img src={photo} alt="" />
        ) : (
          <span aria-hidden>{initial}</span>
        )}
        <span className="first-access-photo-badge" aria-hidden>
          <Camera size={16} />
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          void pick(event.target.files?.[0])
          event.target.value = ''
        }}
      />
      {error ? <p role="alert">{error}</p> : null}
      <button type="button" disabled={busy || !account} onClick={() => void save()}>
        {busy ? 'Salvando…' : photo ? 'Continuar' : 'Pular por agora'}
      </button>
    </div>
  )
}

export function WelcomeStep({
  clinic,
  name,
  onEnter,
}: {
  clinic: StaffClinic
  name: string
  onEnter: () => void
}) {
  const first = name.trim().split(/\s+/)[0]
  return (
    <div className="email-link-form">
      <h1>Boas-vindas ao Luminix{first ? `, ${first}` : ''}!</h1>
      <p>
        Você agora faz parte do <strong>{clinic.name}</strong> como{' '}
        <strong>{roleLabel(clinic.role)}</strong>. A agenda, os clientes e o que a responsável
        liberou para você já estão no painel.
      </p>
      <button type="button" onClick={onEnter}>
        Ir para o painel
      </button>
    </div>
  )
}
