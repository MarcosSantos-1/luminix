import type { Metadata } from 'next'
import {
  LegalPage,
  ResponsibleParty,
  type LegalSection,
} from '../../components/marketing/legal-page'

export const metadata: Metadata = {
  title: 'Política de privacidade',
  description:
    'Como o Luminix trata informações, utiliza fornecedores e organiza o exercício dos direitos sobre dados pessoais.',
}

const sections: LegalSection[] = [
  { id: 'responsavel', title: '1. Responsável e contato', content: <ResponsibleParty /> },
  {
    id: 'papeis',
    title: '2. Luminix e estabelecimentos',
    content: (
      <>
        <p>
          Para cadastro de gestão, autenticação e segurança da própria plataforma, o Luminix define
          as finalidades e os meios do tratamento. Para informações de clientes inseridas por um
          estabelecimento, a clínica, salão ou studio normalmente determina a finalidade do
          atendimento, e o Luminix trata os dados conforme as instruções e o serviço contratado.
        </p>
        <p>
          Esses papéis dependem da operação concreta. A plataforma não dá a uma clínica acesso aos
          vínculos ou registros de clientes em outras clínicas. Para informações sobre o atendimento
          prestado por um espaço, consulte também a política e o canal de contato dele.
        </p>
      </>
    ),
  },
  {
    id: 'informacoes',
    title: '3. Quais informações são tratadas',
    content: (
      <>
        <ul>
          <li>
            <strong>Conta de gestão:</strong> nome, e-mail, dados de autenticação e celular
            informado no cadastro. O celular pode ficar temporariamente no navegador para ser
            reutilizado na configuração do espaço.
          </li>
          <li>
            <strong>Estabelecimento:</strong> identificação, contato, endereço, marca, fotos,
            equipe, serviços, disponibilidade e preferências cadastradas.
          </li>
          <li>
            <strong>Operação:</strong> informações de clientes e atendimentos inseridas pelo
            estabelecimento, quando o recurso é utilizado.
          </li>
          <li>
            <strong>Segurança e uso:</strong> registros técnicos de acesso, eventos de autorização,
            dispositivo, navegador e informações de navegação necessárias à operação e ao
            diagnóstico.
          </li>
          <li>
            <strong>Integrações:</strong> identificadores e situação do cadastro financeiro;
            informações enviadas diretamente a fornecedores em seus componentes seguem também os
            avisos desses fornecedores.
          </li>
        </ul>
        <p>
          Durante a preparação, utilize dados sintéticos nos testes. O portal de clientes ainda não
          solicita CPF ou senha. Não envie informações de saúde ou documentos reais nesta fase.
        </p>
      </>
    ),
  },
  {
    id: 'finalidades',
    title: '4. Para que usamos os dados',
    content: (
      <>
        <p>
          As finalidades incluem criar e autenticar contas, configurar espaços, executar os recursos
          solicitados, controlar permissões, prevenir abuso, investigar falhas e prestar
          atendimento. As bases aplicáveis podem incluir execução de contrato ou procedimentos
          solicitados, cumprimento de obrigações, exercício de direitos e legítimo interesse, quando
          cabível e avaliado.
        </p>
        <p>
          Consentimento será utilizado quando necessário para uma finalidade específica, com
          informação clara e possibilidade de revogação. O aceite dos termos não substitui esse
          consentimento. Dados sensíveis exigem avaliação e fundamento próprios antes de habilitar
          funcionalidades que os utilizem.
        </p>
        <p>
          A preferência de novidades exibida no cadastro ainda não está integrada a campanhas. Não é
          tratada como autorização persistida para envio de publicidade nesta fase.
        </p>
      </>
    ),
  },
  {
    id: 'fornecedores',
    title: '5. Fornecedores e compartilhamento',
    content: (
      <>
        <p>
          A infraestrutura utiliza Google Firebase para autenticação, Neon para banco de dados,
          Vercel e Fly.io para hospedagem, Cloudflare R2 para mídia e Stripe para componentes
          financeiros em teste. Consultas de endereço podem envolver serviços de CEP e Google Maps.
          No admin publicado, Vercel Analytics fornece métricas de navegação.
        </p>
        <p>
          O acesso de fornecedores deve se limitar ao necessário para a função contratada.
          Informações também podem ser fornecidas para atender obrigações ou solicitações legalmente
          válidas, com análise do alcance aplicável. Não há funcionalidade de venda de dados
          pessoais.
        </p>
        <p>
          Alguns fornecedores podem processar dados fora do Brasil. As condições e os mecanismos
          aplicáveis às transferências internacionais deverão ser verificados e documentados antes
          do uso com clientes reais, inclusive contratos, destinos e garantias.
        </p>
      </>
    ),
  },
  {
    id: 'navegador',
    title: '6. Sessão e armazenamento no navegador',
    content: (
      <>
        <p>
          O serviço utiliza armazenamento local ou de sessão para autenticação, preferências visuais
          e continuidade de etapas. No login da gestão, “Manter conectada” conserva a sessão entre
          visitas; sem essa opção, a sessão é limitada à aba. Sair da conta encerra o acesso local.
        </p>
        <p>
          Limpar os dados do navegador pode remover preferências e exigir novo login. Não instale
          extensões desconhecidas nem compartilhe um dispositivo com a sessão aberta. A política não
          pressupõe consentimento para rastreadores publicitários; novas tecnologias opcionais
          deverão ser avaliadas e informadas antes de sua adoção.
        </p>
      </>
    ),
  },
  {
    id: 'retencao',
    title: '7. Conservação e proteção',
    content: (
      <>
        <p>
          Os dados devem permanecer pelo tempo necessário à finalidade, à relação contratual e às
          obrigações aplicáveis. Pedidos de exclusão podem ter exceções para obrigações legais,
          prevenção a fraude e exercício regular de direitos. Não existe uma promessa de eliminação
          instantânea de todos os registros e backups.
        </p>
        <p>
          O calendário detalhado de retenção, o ciclo de descarte de mídia e as rotinas de exclusão
          ainda estão sendo definidos para o lançamento. Solicitações serão avaliadas com indicação
          do alcance e das retenções justificadas.
        </p>
        <p>
          A proteção inclui autenticação, permissões por estabelecimento, restrições de acesso ao
          banco e registros de auditoria. Nenhum sistema elimina todos os riscos. Incidentes serão
          avaliados e comunicados conforme as obrigações aplicáveis.
        </p>
      </>
    ),
  },
  {
    id: 'direitos',
    title: '8. Seus direitos',
    content: (
      <>
        <p>
          Você pode solicitar confirmação do tratamento, acesso, correção e informações sobre
          compartilhamento. Conforme as condições legais, pode pedir portabilidade, eliminação,
          anonimização ou bloqueio, revogar consentimento e contestar tratamento irregular. Também
          pode solicitar revisão de decisões exclusivamente automatizadas que afetem seus
          interesses, quando aplicável.
        </p>
        <p>
          Use o canal confirmado do responsável para fazer a solicitação. Pode ser necessária uma
          verificação proporcional de identidade para impedir que terceiros acessem seus dados. Para
          registros de atendimento, procure o estabelecimento responsável; a plataforma deverá
          colaborar dentro de sua função.
        </p>
        <p>
          O canal público definitivo ainda está pendente nesta versão. Participantes de testes podem
          usar o contato pelo qual foram convidados. A{' '}
          <a href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares">
            ANPD explica os direitos dos titulares
          </a>{' '}
          e disponibiliza orientações para reclamações.
        </p>
      </>
    ),
  },
  {
    id: 'mudancas',
    title: '9. Mudanças nesta política',
    content: (
      <>
        <p>
          Esta versão descreve a fase atual e suas limitações. Mudanças relevantes no tratamento
          serão refletidas nesta página e comunicadas pelos meios adequados. A ativação de funções
          para menores de idade ou dados de saúde exige avaliação específica; não é autorizada
          genericamente por este documento.
        </p>
        <p>
          Antes da abertura a clientes reais, serão completados os dados do responsável, o canal
          para direitos, a revisão jurídica e as políticas de retenção e transferência. Referência
          legal:{' '}
          <a href="https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html">
            Lei Geral de Proteção de Dados Pessoais
          </a>
          .
        </p>
      </>
    ),
  },
]

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Política de privacidade"
      intro="Quais informações passam pelo Luminix, por que elas são necessárias e como você pode cuidar dos seus dados."
      sections={sections}
    />
  )
}
