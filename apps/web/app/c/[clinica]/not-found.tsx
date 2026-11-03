import Link from 'next/link'
export default function ClinicNotFound() {
  return (
    <main className="portal-main">
      <section className="panel">
        <h1>Página não disponível</h1>
        <p className="lead">
          Este espaço não foi encontrado ou sua página ainda não está publicada. Confira o link com
          o estabelecimento.
        </p>
        <Link href="/acesso">Orientações para clientes</Link>
      </section>
    </main>
  )
}
