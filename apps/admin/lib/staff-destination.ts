import type { StaffClinic } from '@/components/staff-provider'

export const DRAFT_CLINIC_NAME = 'Minha clínica'

export function staffHomePath(clinics: StaffClinic[]): string | null {
  const draft = clinics.find((clinic) => clinic.status === 'draft')
  if (draft) return `/clinics/${draft.id}/onboarding`
  if (clinics.length === 1) return `/clinics/${clinics[0].id}`
  if (clinics.length > 1) return '/clinics'
  return null
}

export function untitledClinicName(name: string): boolean {
  return name.trim().toLocaleLowerCase('pt-BR') === DRAFT_CLINIC_NAME.toLocaleLowerCase('pt-BR')
}
