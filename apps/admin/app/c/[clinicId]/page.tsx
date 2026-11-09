import { ClinicHome } from './clinic-home'

export default async function ClinicPage({
  searchParams,
}: {
  searchParams: Promise<{
    secao?: string | string[]
    aba?: string | string[]
    'boas-vindas'?: string | string[]
  }>
}) {
  const params = await searchParams
  const secao = Array.isArray(params.secao) ? params.secao[0] : params.secao
  const aba = Array.isArray(params.aba) ? params.aba[0] : params.aba
  return (
    <ClinicHome
      initialSection={secao || 'inicio'}
      initialSettingsTab={aba}
      welcome={params['boas-vindas'] === '1'}
    />
  )
}
