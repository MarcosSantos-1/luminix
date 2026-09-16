'use client'
import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  isSignInWithEmailLink,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
} from 'firebase/auth'
import { getFirebaseAuth } from '@/lib/firebase'
import { useStaff } from '@/components/staff-provider'

export default function LoginPage() {
  const staff = useStaff()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [emailLink, setEmailLink] = useState(false)
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        setEmailLink(isSignInWithEmailLink(getFirebaseAuth(), window.location.href))
      } catch {
        setError('Autenticação indisponível.')
      }
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [])
  useEffect(() => {
    if (staff.user && !staff.loading && !staff.error) router.replace('/clinics')
  }, [staff.user, staff.loading, staff.error, router])
  async function perform(action: 'login' | 'link' | 'reset') {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const auth = getFirebaseAuth()
      if (action === 'login') {
        if (emailLink) {
          await signInWithEmailLink(auth, email.trim(), window.location.href)
          window.history.replaceState(null, '', '/login')
          setEmailLink(false)
        } else {
          await signInWithEmailAndPassword(auth, email.trim(), password)
        }
        setPassword('')
      } else if (action === 'link') {
        await sendSignInLinkToEmail(auth, email.trim(), {
          url: `${window.location.origin}/login`,
          handleCodeInApp: true,
        })
        setMessage(
          'Se o envio estiver disponível, você receberá um link por e-mail. Verifique também o spam.',
        )
      } else {
        try {
          await sendPasswordResetEmail(auth, email.trim())
        } catch {
          /* Prevent account enumeration. */
        }
        setMessage('Se houver uma conta elegível, você receberá as instruções por e-mail.')
      }
    } catch {
      setError(
        'Não foi possível concluir. Confira os dados ou solicite um novo link e tente novamente.',
      )
    } finally {
      setBusy(false)
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void perform('login')
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6">
      <Link href="/">← Luminix</Link>
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="mb-2 text-2xl font-bold">Acesso da equipe</h1>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p>
            {emailLink
              ? 'Confirme o e-mail que recebeu este link.'
              : 'Entre com sua conta individual.'}
          </p>
          <label className="flex flex-col gap-1">
            E-mail
            <input
              className="rounded-xl border border-border bg-background p-3"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          {!emailLink && (
            <label className="flex flex-col gap-1">
              Senha
              <input
                className="rounded-xl border border-border bg-background p-3"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          )}
          <button
            className="rounded-xl bg-primary p-3 text-white disabled:opacity-50"
            disabled={busy || staff.loading}
            type="submit"
          >
            {busy || staff.loading ? 'Aguarde…' : emailLink ? 'Confirmar acesso' : 'Entrar'}
          </button>
          {!emailLink && (
            <>
              <button
                type="button"
                disabled={busy || staff.loading || !email.trim()}
                onClick={() => void perform('link')}
              >
                Receber link de acesso
              </button>
              <button
                type="button"
                disabled={busy || staff.loading || !email.trim()}
                onClick={() => void perform('reset')}
              >
                Recuperar senha
              </button>
            </>
          )}
        </form>
        {message && (
          <p className="mt-4" role="status">
            {message}
          </p>
        )}
        {(error || staff.error) && (
          <div className="mt-4" role="alert">
            <p>{error || staff.error}</p>
            <button disabled={busy || staff.loading} onClick={staff.refresh}>
              Tentar novamente
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
