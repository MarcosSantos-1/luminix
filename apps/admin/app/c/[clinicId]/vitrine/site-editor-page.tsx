'use client'

import Link from 'next/link'
import { useClinic } from '@/components/clinic-workspace'
import { SiteEditor } from '@/components/site-editor/site-editor'

export function SiteEditorPage() {
  const { clinic, permissions } = useClinic()
  const ref = clinic.share_code || clinic.id
  const backHref = `/c/${ref}?secao=configuracoes&aba=vitrine`
  if (!permissions.includes('settings:manage') || clinic.status !== 'active')
    return (
      <div className="se-status" role="alert">
        <p>
          {clinic.status !== 'active'
            ? 'Conclua o cadastro do espaço para editar o site.'
            : 'Seu acesso não permite editar o site deste espaço.'}
        </p>
        <Link href={backHref}>Voltar ao painel</Link>
      </div>
    )
  return <SiteEditor clinic={clinic} backHref={backHref} />
}
