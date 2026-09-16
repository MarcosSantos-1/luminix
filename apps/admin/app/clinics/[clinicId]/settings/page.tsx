'use client'
import { useEffect, useState } from 'react'
import { useClinic } from '@/components/clinic-workspace'
import { useStaff } from '@/components/staff-provider'
export default function SettingsPage() {
  const clinic = useClinic()
  const staff = useStaff()
  const key = `${staff.user?.uid}/${clinic.clinic.id}/${staff.revision}`
  const allowed = clinic.permissions.includes('settings:manage')
  const [state, setState] = useState<{
    key: string
    settings?: { timezone: string; locale: string; currency: string }
    error?: string
  } | null>(null)
  useEffect(() => {
    const user = staff.user
    if (!user || !allowed) return
    let active = true
    const abort = new AbortController()
    void (async () => {
      try {
        const response = await fetch(`/api/clinics/${clinic.clinic.id}/settings`, {
          headers: { authorization: `Bearer ${await user.getIdToken()}` },
          cache: 'no-store',
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20_000)]),
        })
        if (!response.ok) throw new Error('Unavailable')
        const data = await response.json()
        if (active) setState({ key, settings: data.settings })
      } catch {
        if (active)
          setState({
            key,
            error: 'Configurações indisponíveis ou acesso alterado. Atualize seu acesso.',
          })
      }
    })()
    return () => {
      active = false
      abort.abort()
    }
  }, [staff.user, clinic.clinic.id, key, allowed])
  if (!allowed)
    return <p role="alert">Você não tem permissão para gerenciar configurações nesta clínica.</p>
  if (state?.key !== key) return <p role="status">Carregando configurações…</p>
  if (!state.settings) return <p role="alert">{state.error}</p>
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-xl font-bold">Configurações iniciais</h2>
      <dl>
        <dt>Fuso horário</dt>
        <dd>{state.settings.timezone}</dd>
        <dt>Idioma</dt>
        <dd>{state.settings.locale}</dd>
        <dt>Moeda</dt>
        <dd>{state.settings.currency}</dd>
      </dl>
      <p className="text-sm text-muted-foreground">
        Valores reais do backend. Edição será conectada nas próximas etapas.
      </p>
    </section>
  )
}
