import type { Metadata } from 'next'
import { AuthScreen } from '../../../components/client-app/auth-screen'

export const metadata: Metadata = { title: 'Entrar' }

export default function SignInPage() {
  return <AuthScreen mode="entrar" />
}
