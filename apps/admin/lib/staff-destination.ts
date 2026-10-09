import type { StaffClinic } from '@/components/staff-provider'

export const DRAFT_CLINIC_NAME = 'Minha clínica'

export function awaitsOnboarding(clinics: StaffClinic[]) {
  return clinics.length === 0 || clinics.some((clinic) => clinic.status === 'draft')
}

/** Words for the gate loader: onboarding only after we know the space is still a draft. */
export function loadingScene(clinics: StaffClinic[], loading: boolean): 'workspace' | 'onboarding' | 'entry' {
  if (loading && clinics.length === 0) return 'entry'
  return awaitsOnboarding(clinics) ? 'onboarding' : 'workspace'
}

export function clinicRef(clinic: { id: string; code?: string | null }) {
  return clinic.code || clinic.id
}

export function staffHomePath(clinics: StaffClinic[]): string | null {
  const draft = clinics.find((clinic) => clinic.status === 'draft')
  if (draft) return `/c/${clinicRef(draft)}/onboarding`
  if (clinics.length === 1) return `/c/${clinicRef(clinics[0])}`
  if (clinics.length > 1) return '/c'
  return null
}

export function untitledClinicName(name: string): boolean {
  return name.trim().toLocaleLowerCase('pt-BR') === DRAFT_CLINIC_NAME.toLocaleLowerCase('pt-BR')
}
