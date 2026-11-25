'use client'

import { useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  OAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  createUserWithEmailAndPassword,
  isSignInWithEmailLink,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signInWithRedirect,
  updateProfile,
} from 'firebase/auth'
import { getFirebaseAuth } from '@/lib/firebase'
import { firstAccessKey } from '@/lib/staff-destination'

export type SocialProvider = 'google' | 'apple'

export function authMessage(code: string): string {
  if (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    code === 'auth/user-cancelled'
  )
    return ''
  if (code === 'auth/popup-blocked')
    return 'O navegador bloqueou a janela de acesso. Permita pop-ups e tente de novo.'
  if (code === 'auth/account-exists-with-different-credential')
    return 'Este e-mail já tem conta no Luminix. Entre do mesmo jeito que você usou antes.'
  if (code === 'auth/operation-not-allowed')
    return 'Este método de acesso ainda não está habilitado. Tente e-mail ou fale com o suporte.'
  if (code === 'auth/unauthorized-domain')
    return 'Este domínio ainda não está autorizado no Firebase.'
  if (code === 'auth/email-already-in-use')
    return 'Este e-mail já tem conta. Entre ou use o Google.'
  if (code === 'auth/weak-password') return 'Use uma senha com pelo menos 6 caracteres.'
  if (code === 'auth/invalid-email')
    return 'Confira o e-mail. No convite, use exatamente o e-mail que recebeu a mensagem.'
  if (code === 'auth/invalid-action-code' || code === 'auth/expired-action-code')
    return 'Este link de convite já foi usado ou expirou. Peça para reenviar o convite e abra o e-mail mais recente.'
  if (code === 'auth/network-request-failed')
    return 'Sem conexão com a internet agora. Confira a rede e tente de novo.'
  if (code === 'auth/too-many-requests')
    return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.'
  if (code === 'auth/user-disabled') return 'Este acesso está desativado. Fale com o seu espaço.'
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  )
    return 'Não foi possível entrar. Confira o e-mail e a senha.'
  // The code helps support find the cause without exposing anything sensitive.
  return `Não foi possível concluir. Confira os dados e tente novamente.${code ? ` (${code})` : ''}`
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

  /** Google or Apple: popup first; a blocked popup falls back to a full-page redirect. */
  function social(kind: SocialProvider) {
    return run(async () => {
      const provider = kind === 'google' ? new GoogleAuthProvider() : new OAuthProvider('apple.com')
      if (provider instanceof OAuthProvider) {
        provider.addScope('email')
        provider.addScope('name')
        provider.setCustomParameters({ locale: 'pt_BR' })
      } else provider.setCustomParameters({ prompt: 'select_account' })
      const auth = getFirebaseAuth()
      await setPersistence(auth, browserSessionPersistence)
      try {
        await signInWithPopup(auth, provider)
      } catch (error) {
        const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
        if (code !== 'auth/popup-blocked') throw error
        await signInWithRedirect(auth, provider)
      }
      return true
    })
  }

  function google() {
    return social('google')
  }

  function signIn(email: string, password: string, remember = false) {
    return run(async () => {
      const auth = getFirebaseAuth()
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence)
      await signInWithEmailAndPassword(auth, email.trim(), password)
      return true
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
      // Invitation link: the space that invited comes in `c`; the first access opens next.
      const clinic = new URL(window.location.href).searchParams.get('c') ?? ''
      try {
        window.sessionStorage.setItem(firstAccessKey, clinic || 'any')
      } catch {
        /* Private mode: the login still lands on the space; the password is set later. */
      }
      window.history.replaceState(null, '', window.location.pathname)
      setEmailLink(false)
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
    social,
    signIn,
    signUp,
    confirmEmailLink,
    reset,
  }
}
