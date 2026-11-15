import { redirect } from 'next/navigation'

// The old guidance page is replaced by the client area sign-in.
export default function AcessoPage() {
  redirect('/cliente/entrar')
}
