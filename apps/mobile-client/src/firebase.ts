// Web build of the app: the browser keeps the session (IndexedDB), like the site.
import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { firebaseConfig } from './firebase-config'

let auth: Auth | null = null

export function clientAuth(): Auth {
  if (auth) return auth
  auth = getAuth(getApps().length ? getApp() : initializeApp(firebaseConfig()))
  auth.languageCode = 'pt-BR'
  return auth
}
