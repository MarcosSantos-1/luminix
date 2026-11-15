import type { Metadata } from 'next'
import { AuthScreen } from '../../../components/client-app/auth-screen'

export const metadata: Metadata = { title: 'Criar conta' }

export default function SignUpPage() {
  return <AuthScreen mode="cadastro" />
}
