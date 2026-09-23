import { redirect } from 'next/navigation'

export default async function SettingsPage({ params }: { params: Promise<{ clinicId: string }> }) {
  const { clinicId } = await params
  redirect(`/clinics/${clinicId}?secao=configuracoes`)
}
