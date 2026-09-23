import { ManagerHome } from '@/components/manager/manager-home'
import './manager.css'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ secao?: string | string[] }>
}) {
  const params = await searchParams
  const secao = Array.isArray(params.secao) ? params.secao[0] : params.secao
  return <ManagerHome initialSection={secao || 'inicio'} />
}
