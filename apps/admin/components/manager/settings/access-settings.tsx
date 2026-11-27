'use client'

import { SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { accessOptions } from '@/lib/access'
import { type ClinicApi, useClinicResource } from './clinic-api'
import { LoadError, SettingsCard, SettingsSkeleton, ToggleRow } from './settings-kit'

export type StaffMember = {
  id: string
  name: string
  email: string
  photo?: string | null
  role: string
  status: 'active' | 'revoked'
  isSelf: boolean
  professionalId: string | null
  invitedAt: string | null
  lastSignInAt: string | null
}

type LevelOption = {
  role: 'team'
  permission: string
  enabled: boolean
}

export function TeamAccessLevels({ api }: { api: ClinicApi }) {
  const levels = useClinicResource<{ options: LevelOption[] }>(api, 'access-levels')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function setOption(option: LevelOption, enabled: boolean) {
    setBusy(true)
    setError('')
    try {
      await api.put('access-levels', { role: option.role, permission: option.permission, enabled })
      levels.reload()
    } catch {
      setError('Não foi possível salvar essa permissão. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  if (levels.error && !levels.data)
    return <LoadError message={levels.error} onRetry={levels.reload} />
  if (!levels.data) return <SettingsSkeleton cards={1} />

  return (
    <details className="team-permissions">
      <summary>
        <SlidersHorizontal size={16} aria-hidden /> Permissões da equipe
      </summary>
      <SettingsCard
        icon={<SlidersHorizontal size={20} />}
        title="O que a equipe pode fazer"
        description="Estas opções valem para Equipe, Recepção e Outros que tenham acesso ao painel."
      >
        <div className="settings-stack">
          {accessOptions.map((item) => {
            const option = levels.data!.options.find(
              ({ permission }) => permission === item.permission,
            )
            return option ? (
              <ToggleRow
                key={item.permission}
                title={item.title}
                description={item.description}
                isSelected={option.enabled}
                disabled={busy || levels.loading}
                onChange={(enabled) => void setOption(option, enabled)}
              />
            ) : null
          })}
        </div>
        {error ? (
          <p role="alert" className="settings-field-error">
            {error}
          </p>
        ) : null}
      </SettingsCard>
    </details>
  )
}
