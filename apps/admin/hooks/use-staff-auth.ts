'use client'

import { useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  createUserWithEmailAndPassword,
  isSignInWithEmailLink,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth'
import { getFirebaseAuth } from '@/lib/firebase'

export function authMessage(code: string): string {
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return ''
  if (code === 'auth/popup-blocked')
    return 'O navegador bloqueou a janela do Google. Permita pop-ups e tente de novo.'
  if (code === 'auth/operation-not-allowed')
    return 'Este método de acesso ainda não está habilitado. Tente e-mail ou fale com o suporte.'
  if (code === 'auth/unauthorized-domain')
    return 'Este domínio ainda não está autorizado no Firebase.'
  if (code === 'auth/email-already-in-use')
    return 'Este e-mail já tem conta. Entre ou use o Google.'
  if (code === 'auth/weak-password') return 'Use uma senha com pelo menos 6 caracteres.'
  if (code === 'auth/invalid-email') return 'Confira o e-mail informado.'
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  )
    return 'Não foi possível entrar. Confira o e-mail e a senha.'
  return 'Não foi possível concluir. Confira os dados e tente novamente.'
}

/** E-mail that asked for a link on this device: the return then needs no typing. */
const linkEmailKey = 'luminix:link-email'
export function rememberedLinkEmail() {
  try {
    return window.localStorage.getItem(linkEmailKey) ?? ''
  } catch {
    return ''
  }
}
function rememberLinkEmail(email: string | null) {
  try {
    if (email) window.localStorage.setItem(linkEmailKey, email)
    else window.localStorage.removeItem(linkEmailKey)
  } catch {
    /* Private mode: the return page asks for the e-mail. */
  }
}

export function useStaffAuth() {
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

  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      return await action()
    } catch (caught) {
      const code =
        typeof caught === 'object' && caught && 'code' in caught ? String(caught.code) : ''
      setError(authMessage(code))
      return undefined
    } finally {
      setBusy(false)
    }
  }

  function google() {
    return run(async () => {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      const auth = getFirebaseAuth()
      await setPersistence(auth, browserSessionPersistence)
      await signInWithPopup(auth, provider)
    })
  }

  function signIn(email: string, password: string, remember = false) {
    return run(async () => {
      const auth = getFirebaseAuth()
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence)
      await signInWithEmailAndPassword(auth, email.trim(), password)
    })
  }

  function signUp(email: string, password: string, displayName?: string) {
    return run(async () => {
      const auth = getFirebaseAuth()
      await setPersistence(auth, browserSessionPersistence)
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
      const name = displayName?.trim()
      if (name) await updateProfile(credential.user, { displayName: name })
      return credential.user.uid
    })
  }

  function confirmEmailLink(email: string) {
    return run(async () => {
      const auth = getFirebaseAuth()
      await setPersistence(auth, browserSessionPersistence)
      await signInWithEmailLink(auth, email.trim(), window.location.href)
      rememberLinkEmail(null)
      window.history.replaceState(null, '', window.location.pathname)
      setEmailLink(false)
    })
  }

  /** Luminix e-mail through the API; Firebase's own e-mail when that is not configured. */
  function sendLink(email: string) {
    return run(async () => {
      const trimmed = email.trim()
      const response = await fetch('/api/auth/access-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
        cache: 'no-store',
      }).catch(() => null)
      if (response?.status === 429) {
        setError('Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo.')
        return
      }
      if (response?.status === 400) throw Object.assign(new Error(), { code: 'auth/invalid-email' })
      if (!response?.ok)
        await sendSignInLinkToEmail(getFirebaseAuth(), trimmed, {
          url: `${window.location.origin}/login?acesso=link`,
          handleCodeInApp: true,
        })
      rememberLinkEmail(trimmed.toLowerCase())
      setMessage(
        'Se este e-mail tiver acesso, o link chega em instantes. Abra neste aparelho para entrar direto. Confira também o spam.',
      )
    })
  }

  async function reset(email: string) {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      try {
        await sendPasswordResetEmail(getFirebaseAuth(), email.trim())
      } catch {
        /* Avoid account enumeration. */
      }
      setMessage('Se houver uma conta elegível, você receberá as instruções por e-mail.')
    } finally {
      setBusy(false)
    }
  }

  return {
    busy,
    message,
    error,
    emailLink,
    google,
    signIn,
    signUp,
    confirmEmailLink,
    sendLink,
    reset,
  }
}
