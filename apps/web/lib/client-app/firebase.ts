'use client'

import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'

// Same Luminix Firebase project as the admin; one identity can be staff and client.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
}

export function clientAuth(): Auth {
  if (!config.apiKey || !config.appId || !config.projectId)
    throw new Error('Configuração pública do Firebase incompleta')
  const auth = getAuth(getApps().length ? getApp() : initializeApp(config))
  auth.languageCode = 'pt-BR'
  return auth
}
