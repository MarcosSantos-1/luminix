import { ManagerHome } from '@/components/manager/manager-home'
import './manager.css'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ secao?: string | string[]; 'boas-vindas'?: string | string[] }>
}) {
  const params = await searchParams
  const secao = Array.isArray(params.secao) ? params.secao[0] : params.secao
  return (
    <ManagerHome
      initialSection={secao || 'inicio'}
      messages={{
        welcome: params['boas-vindas'] === '1',
        demoPublicUrl: 'https://luminix.beauty/c/demonstracao',
      }}
    />
  )
}
