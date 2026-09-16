'use client'
import Link from 'next/link'
import { useClinic } from '@/components/clinic-workspace'
export default function ClinicHome() {
  const { clinic, permissions } = useClinic()
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-xl font-bold">Primeiros passos</h2>
      <p>Seu vínculo foi validado. Esta página usa a clínica real selecionada.</p>
      {clinic.status === 'draft' && (
        <p>
          A clínica está em rascunho. Salvar etapas e concluir o onboarding será conectado na Step
          5.
        </p>
      )}
      {permissions.includes('onboarding:manage') && (
        <Link className="block text-primary" href="/?demo=onboarding">
          Experimentar onboarding de demonstração →
        </Link>
      )}
      <p className="text-sm text-muted-foreground">
        O protótipo usa dados ilustrativos e não salva alterações na sua clínica.
      </p>
      {permissions.includes('settings:manage') && (
        <Link className="block" href={`/clinics/${clinic.id}/settings`}>
          Ver configurações iniciais →
        </Link>
      )}
    </section>
  )
}
