import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'

/**
 * On our production domains the Google/Apple sign-in runs under the same domain
 * (`/__/auth/*`, proxied to Firebase in next.config.mjs). With firebaseapp.com in between,
 * browsers that block third-party storage lose the result and the login silently stays put.
 */
const firstPartyAuthHosts = new Set(['app.luminix.beauty', 'luminix.beauty'])

function authDomain() {
  if (typeof window !== 'undefined' && firstPartyAuthHosts.has(window.location.hostname))
    return window.location.hostname
  return process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  authDomain: authDomain(),
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
}

function getFirebaseApp(): FirebaseApp {
  const required = [firebaseConfig.apiKey, firebaseConfig.appId, firebaseConfig.projectId]

  if (required.some((value) => !value)) {
    throw new Error('Configuração pública do Firebase incompleta')
  }

  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
}

export function getFirebaseAuth(): Auth {
  const auth = getAuth(getFirebaseApp())
  auth.languageCode = 'pt-BR'
  return auth
}
