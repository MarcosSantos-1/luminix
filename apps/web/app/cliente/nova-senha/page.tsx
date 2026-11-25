import type { Metadata } from 'next'
import { NewPasswordScreen } from '../../../components/client-app/new-password-screen'

export const metadata: Metadata = { title: 'Nova senha' }

export default function NewPasswordPage() {
  return <NewPasswordScreen />
}
