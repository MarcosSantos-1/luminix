import Link from 'next/link'
import { notFound } from 'next/navigation'

import { getPreviewClinic } from '../../../lib/preview-clinic'

export default async function ClinicPage({ params }: { params: Promise<{ clinica: string }> }) {
  const { clinica } = await params
  const clinic = getPreviewClinic(clinica)
  if (!clinic) notFound()

  return (
    <section className="panel">
      <p className="eyebrow">Página pública · Demonstração</p>
      <h1>{clinic.name}</h1>
      <p className="lead">
        Aqui ficará a apresentação pública da clínica: identidade visual, serviços e contato. Nenhum
        estabelecimento real está cadastrado nesta demonstração.
      </p>
      <Link className="button" href={`/c/${clinic.slug}/meu-plano`}>
        Área do cliente →
      </Link>
      <p className="note">
        O endereço identifica a clínica. Ele não concede acesso a informações privadas.
      </p>
    </section>
  )
}
