'use client'

import Link from 'next/link'
import { ArrowRight, CreditCard } from 'lucide-react'
import { useClinicResource, type ClinicApi } from '@/components/manager/settings/clinic-api'

export function ReceiptsLink({
  api,
  href,
  className,
}: {
  api: ClinicApi
  href: string
  className: string
}) {
  const { data, loading } = useClinicResource<{ active: boolean }>(api, 'payments/in-app')
  return (
    <Link href={href} className={className} aria-busy={loading}>
      <CreditCard size={17} aria-hidden />
      {data?.active
        ? 'Configuração de recebimentos'
        : data?.active === false
          ? 'Quer receber pelo app (Stripe)?'
          : 'Recebimentos pelo app (Stripe)'}
      <ArrowRight size={15} aria-hidden />
    </Link>
  )
}
