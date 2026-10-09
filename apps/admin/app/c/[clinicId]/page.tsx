import { ClinicHome } from './clinic-home'

export default async function ClinicPage({
  searchParams,
}: {
  searchParams: Promise<{ secao?: string | string[] }>
}) {
  const params = await searchParams
  const secao = Array.isArray(params.secao) ? params.secao[0] : params.secao
  return <ClinicHome initialSection={secao || 'inicio'} />
}
