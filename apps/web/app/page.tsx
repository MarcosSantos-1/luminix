import Link from 'next/link'

export default function HomePage() {
  return (
    <section className="panel">
      <p className="eyebrow">Luminix · Base web</p>
      <h1>
        Um endereço para a sua clínica.
        <br />
        Um espaço para seus clientes.
      </h1>
      <p className="lead">
        Estamos preparando o site do Luminix e as páginas de cada clínica. Esta é uma base de
        desenvolvimento, ainda sem cadastro, agendamento ou login de clientes.
      </p>
      <Link className="button" href="/c/demonstracao">
        Explorar a página demonstrativa →
      </Link>
      <p className="note">
        Gestão e portal do cliente são aplicações separadas, conectadas à mesma API.
      </p>
    </section>
  )
}
