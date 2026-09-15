import Link from 'next/link'

export default function NotFoundPage() {
  return (
    <section className="panel">
      <p className="eyebrow">Página não encontrada</p>
      <h1>Este endereço não está disponível.</h1>
      <p className="lead">A clínica pode não existir ou ainda não ter uma página publicada.</p>
      <Link className="button" href="/">
        Voltar ao Luminix
      </Link>
    </section>
  )
}
