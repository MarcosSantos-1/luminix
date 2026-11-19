'use client'

import { Button } from '@heroui/react'
import { CalendarDays, CalendarRange, Clock3 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { BookingProfessional } from '../appointments/booking-modal'
import {
  StandardWeek,
  type ProfessionalDayRow,
  type WeeklyRow,
} from '../appointments/schedule-modal'
import '../appointments/appointments.css'
import { useClinicApi } from './clinic-api'
import { LoadError, SettingsCard, SettingsSkeleton } from './settings-kit'

type Agenda = {
  weeklyAvailability: WeeklyRow[]
  professionals: BookingProfessional[]
  professionalAvailability?: ProfessionalDayRow[]
  canManageHours?: boolean
  canManageTeam?: boolean
}

/** Configurações → Rotina: the week that repeats (space and team); exceptions live in the Agenda. */
export function RoutineSettings({
  clinicId,
  onOpenAgenda,
}: {
  clinicId: string
  onOpenAgenda: () => void
}) {
  const api = useClinicApi(clinicId)
  const [data, setData] = useState<Agenda | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!api.ready) return
    let active = true
    const now = new Date()
    void api
      .get<Agenda>('agenda', {
        from: now.toISOString(),
        to: new Date(now.getTime() + 86_400_000).toISOString(),
      })
      .then((body) => {
        if (!active) return
        setData(body)
        setError('')
      })
      .catch(() => active && setError('Não foi possível carregar a rotina.'))
    return () => {
      active = false
    }
  }, [api, reload])

  if (error && !data) return <LoadError message={error} onRetry={() => setReload((v) => v + 1)} />
  if (!data) return <SettingsSkeleton cards={1} />
  return (
    <div className="settings-stack">
      <SettingsCard
        icon={<CalendarDays size={20} />}
        title="Rotina da semana"
        description={
          data.professionals.length
            ? 'O horário que se repete toda semana: quando o espaço abre e quando cada profissional atende.'
            : 'O horário que se repete toda semana. As clientes só agendam dentro dele.'
        }
      >
        <StandardWeek
          key={reload}
          api={api}
          weekly={data.weeklyAvailability}
          professionals={data.professionals}
          professionalAvailability={data.professionalAvailability ?? []}
          canManageHours={data.canManageHours !== false}
          canManageTeam={data.canManageTeam !== false}
          onSaved={() => setReload((value) => value + 1)}
        />
      </SettingsCard>
      <SettingsCard
        icon={<CalendarRange size={20} />}
        title="Semanas diferentes, feriados e férias"
        description="Para mudar só uma semana, um dia ou marcar férias, use a Agenda → Horários. A rotina continua valendo para o resto."
      >
        <Button variant="secondary" onPress={onOpenAgenda}>
          <Clock3 size={16} aria-hidden /> Abrir Agenda
        </Button>
      </SettingsCard>
    </div>
  )
}
