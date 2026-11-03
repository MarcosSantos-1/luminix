'use client'

export default function ClinicError({ reset }: { reset: () => void }) {
  return (
    <main className="portal-main">
      <section className="panel">
        <h1>Não foi possível carregar o espaço.</h1>
        <p className="lead">
          Tente novamente em instantes para conhecer os serviços e as informações deste espaço.
        </p>
        <button className="button" onClick={reset}>
          Tentar novamente
        </button>
      </section>
    </main>
  )
}
