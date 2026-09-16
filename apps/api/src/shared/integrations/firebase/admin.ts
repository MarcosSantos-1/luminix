import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth'

const appName = 'luminix-api'

export type FirebaseAdminConfig = {
  clientEmail?: string
  privateKey?: string
  projectId: string
}

export function readFirebaseAdminConfig(
  environment: NodeJS.ProcessEnv = process.env,
): FirebaseAdminConfig {
  const projectId = environment.FIREBASE_PROJECT_ID
  const clientEmail = environment.FIREBASE_CLIENT_EMAIL
  const privateKey = environment.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID não configurado')
  }

  if (Boolean(clientEmail) !== Boolean(privateKey)) {
    throw new Error('FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY devem ser configuradas juntas')
  }

  return { clientEmail, privateKey, projectId }
}

export function getFirebaseAdminApp(environment: NodeJS.ProcessEnv = process.env): App {
  const existingApp = getApps().find((app) => app.name === appName)

  if (existingApp) {
    return existingApp
  }

  const config = readFirebaseAdminConfig(environment)
  const credential =
    config.clientEmail && config.privateKey
      ? cert({
          clientEmail: config.clientEmail,
          privateKey: config.privateKey,
          projectId: config.projectId,
        })
      : applicationDefault()

  return initializeApp({ credential, projectId: config.projectId }, appName)
}

export function getFirebaseAdminAuth(environment: NodeJS.ProcessEnv = process.env): Auth {
  return getAuth(getFirebaseAdminApp(environment))
}

export async function verifyFirebaseIdToken(
  idToken: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<DecodedIdToken> {
  if (!idToken.trim()) {
    throw new Error('Token Firebase ausente')
  }

  return getFirebaseAdminAuth(environment).verifyIdToken(idToken, true)
}
