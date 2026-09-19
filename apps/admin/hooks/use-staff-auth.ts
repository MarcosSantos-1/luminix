'use client'

import { useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
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

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      await action()
    } catch (caught) {
      const code =
        typeof caught === 'object' && caught && 'code' in caught ? String(caught.code) : ''
      setError(authMessage(code))
    } finally {
      setBusy(false)
    }
  }

  function google() {
    return run(async () => {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await signInWithPopup(getFirebaseAuth(), provider)
    })
  }

  function signIn(email: string, password: string) {
    return run(async () => {
      await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password)
    })
  }

  function signUp(email: string, password: string, displayName?: string) {
    return run(async () => {
      const auth = getFirebaseAuth()
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
      const name = displayName?.trim()
      if (name) await updateProfile(credential.user, { displayName: name })
    })
  }

  function confirmEmailLink(email: string) {
    return run(async () => {
      await signInWithEmailLink(getFirebaseAuth(), email.trim(), window.location.href)
      window.history.replaceState(null, '', window.location.pathname)
      setEmailLink(false)
    })
  }

  function sendLink(email: string) {
    return run(async () => {
      await sendSignInLinkToEmail(getFirebaseAuth(), email.trim(), {
        url: `${window.location.origin}/login`,
        handleCodeInApp: true,
      })
      setMessage(
        'Se o envio estiver disponível, você receberá um link por e-mail. Verifique também o spam.',
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
