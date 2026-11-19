import type { StaffClinic } from '@/components/staff-provider'

export const DRAFT_CLINIC_NAME = 'Minha clínica'

/** Only an unfinished space of her own (or none yet): the next stop is onboarding. */
export function awaitsOnboarding(clinics: StaffClinic[]) {
  return clinics.every((clinic) => clinic.status === 'draft')
}

/** Words for the gate loader: onboarding only after we know the space is still a draft. */
export function loadingScene(
  clinics: StaffClinic[],
  loading: boolean,
): 'workspace' | 'onboarding' | 'entry' {
  if (loading && clinics.length === 0) return 'entry'
  return awaitsOnboarding(clinics) ? 'onboarding' : 'workspace'
}

export function clinicRef(clinic: { id: string; code?: string | null }) {
  return clinic.code || clinic.id
}

/**
 * Where a signed-in person lands. A draft only opens onboarding when it is her only space: someone
 * invited to a salon while her own registration is unfinished picks the space in /c instead of
 * falling into the draft.
 */
export function staffHomePath(clinics: StaffClinic[]): string | null {
  if (clinics.length === 1)
    return clinics[0].status === 'draft'
      ? `/c/${clinicRef(clinics[0])}/onboarding`
      : `/c/${clinicRef(clinics[0])}`
  if (clinics.length > 1) return '/c'
  return null
}

/** Set when an invitation link signs someone in; /primeiro-acesso reads and clears it. */
export const firstAccessKey = 'luminix:first-access'

export function untitledClinicName(name: string): boolean {
  return name.trim().toLocaleLowerCase('pt-BR') === DRAFT_CLINIC_NAME.toLocaleLowerCase('pt-BR')
}
