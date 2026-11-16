// Android/iOS: the session survives restarts through AsyncStorage.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getApp, getApps, initializeApp } from 'firebase/app'
import { initializeAuth, type Auth } from 'firebase/auth'
// Metro resolves firebase/auth with the "react-native" condition, which adds this export; the
// published typings only describe the browser build.
// @ts-expect-error see above
import { getReactNativePersistence } from 'firebase/auth'
import { firebaseConfig } from './firebase-config'

let auth: Auth | null = null

export function clientAuth(): Auth {
  if (auth) return auth
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig())
  auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })
  auth.languageCode = 'pt-BR'
  return auth
}
