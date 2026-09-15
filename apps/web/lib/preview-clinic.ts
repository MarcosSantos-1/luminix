// Fixture pública de desenvolvimento. Não é cadastro, contexto de tenant ou autorização.
const demoClinic = {
  slug: 'demonstracao',
  name: 'Clínica de demonstração',
} as const

export function getPreviewClinic(slug: string) {
  return slug === demoClinic.slug ? demoClinic : null
}
