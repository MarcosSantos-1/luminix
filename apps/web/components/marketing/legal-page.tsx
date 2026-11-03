import type { ReactNode } from 'react'
import { SiteHeader } from './site-header'
import { SiteFooter } from './site-footer'
import '../../app/marketing.css'

export type LegalSection = { id: string; title: string; content: ReactNode }

export function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string
  intro: string
  sections: LegalSection[]
}) {
  return (
    <div className="marketing" id="topo">
      <SiteHeader />
      <main className="legal-main" id="conteudo">
        <div className="legal-intro">
          <span className="section-kicker">TRANSPARÊNCIA, EM PALAVRAS SIMPLES</span>
          <h1>{title}</h1>
          <p>{intro}</p>
          <span className="legal-meta">
            Versão preliminar 0.1 · Atualizada em 2 de novembro de 2026
          </span>
        </div>
        <aside className="legal-draft">
          <strong>Documento preliminar.</strong> O Luminix está em preparação. O nome “Luminix
          Tecnologia” é fictício e os dados do responsável e do canal de contato ainda precisam ser
          preenchidos. Este texto será revisado e completado antes da abertura a clientes reais.
        </aside>
        <div className="legal-layout">
          <nav className="legal-toc" aria-label="Nesta página">
            {sections.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.title}
              </a>
            ))}
          </nav>
          <article className="legal-content">
            {sections.map((section) => (
              <section key={section.id} id={section.id}>
                <h2>{section.title}</h2>
                {section.content}
              </section>
            ))}
          </article>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

export function ResponsibleParty() {
  return (
    <>
      <p>
        <strong>Responsável ilustrativo:</strong> Luminix Tecnologia (nome fictício, não identifica
        uma empresa constituída).
      </p>
      <p>
        <strong>Razão social, CPF/CNPJ e endereço:</strong> a preencher.
        <br />
        <strong>Canal de atendimento e privacidade:</strong> a definir. Não envie documentos ou
        informações sensíveis a endereços não confirmados.
      </p>
      <p>
        Durante a preparação, participantes dos testes devem usar o canal pelo qual foram
        convidados. Para assuntos do atendimento de uma clínica ou studio, procure diretamente o
        estabelecimento.
      </p>
    </>
  )
}
