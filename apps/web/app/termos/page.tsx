import type { Metadata } from 'next'
import Link from 'next/link'
import {
  LegalPage,
  ResponsibleParty,
  type LegalSection,
} from '../../components/marketing/legal-page'

export const metadata: Metadata = {
  title: 'Termos de uso',
  description:
    'Condições de uso do Luminix e informações sobre a fase de preparação da plataforma.',
}

const sections: LegalSection[] = [
  { id: 'responsavel', title: '1. Quem oferece o Luminix', content: <ResponsibleParty /> },
  {
    id: 'servico',
    title: '2. O que é a plataforma',
    content: (
      <>
        <p>
          O Luminix é uma plataforma de gestão para clínicas, salões, studios e profissionais. A
          experiência reúne configuração do estabelecimento, serviços, equipe, clientes e agenda,
          conforme os recursos disponibilizados em cada etapa.
        </p>
        <p>
          O Luminix não presta os procedimentos anunciados pelos estabelecimentos. Informações sobre
          tratamentos, profissionais, preços e condições de atendimento são de responsabilidade de
          quem oferece o serviço, sem afastar as responsabilidades legais de cada parte.
        </p>
        <p>
          Nesta fase de preparação, páginas demonstrativas usam exemplos. O portal autenticado do
          cliente, aplicativos nativos, cobranças e outras funções futuras não devem ser
          considerados disponíveis apenas por aparecerem em uma prévia.
        </p>
      </>
    ),
  },
  {
    id: 'conta',
    title: '3. Sua conta e seus acessos',
    content: (
      <>
        <p>
          Informe dados corretos e mantenha-os atualizados. Quem cria ou administra um espaço deve
          ter autorização para representá-lo e cadastrar suas informações. A conta de gestão é
          destinada a pessoas com capacidade para assumir essas responsabilidades.
        </p>
        <p>
          Proteja sua senha e não compartilhe credenciais. O acesso de cada integrante da equipe
          depende dos vínculos e permissões atribuídos ao espaço. Ter uma conta não autoriza acesso
          aos dados de outros estabelecimentos.
        </p>
        <p>
          “Manter conectada” permite conservar a sessão no dispositivo. Evite essa opção em
          aparelhos compartilhados e use “Sair” ao terminar. Avise pelo canal confirmado de
          atendimento se suspeitar de uso indevido.
        </p>
      </>
    ),
  },
  {
    id: 'uso',
    title: '4. Uso responsável',
    content: (
      <>
        <p>
          Use a plataforma para finalidades legítimas. Não tente acessar contas alheias, contornar
          permissões, explorar vulnerabilidades, interromper o serviço, enviar conteúdo malicioso ou
          divulgar dados sem autorização.
        </p>
        <p>
          O estabelecimento é responsável por ter fundamento adequado para tratar as informações que
          cadastra e por respeitar os direitos de clientes e profissionais. Durante os testes desta
          fase inicial, utilize dados sintéticos; não insira prontuários, documentos ou informações
          reais de saúde.
        </p>
        <p>
          Você conserva os direitos sobre seu conteúdo. Seu envio permite ao Luminix processá-lo e
          exibi-lo na medida necessária à prestação do serviço. Não publique imagens, marcas ou
          outros materiais sem os direitos necessários.
        </p>
      </>
    ),
  },
  {
    id: 'pagamentos',
    title: '5. Valores, reservas e pagamentos',
    content: (
      <>
        <p>
          O cadastro financeiro e as preferências de pagamento estão em fase de teste. Configurar
          sinal, retenção ou regras de reserva não realiza cobrança, não contrata automaticamente um
          plano e não comprova pagamento.
        </p>
        <p>
          Antes de uma modalidade paga ser ativada, suas condições, preços, periodicidade,
          cancelamento e eventuais custos deverão ser apresentados para contratação específica.
          Estes termos não autorizam cobranças futuras não informadas.
        </p>
        <p>
          Regras de atendimento e cancelamento de um estabelecimento deverão ser apresentadas antes
          da contratação aplicável. Nenhuma configuração afasta direitos previstos na legislação.
        </p>
      </>
    ),
  },
  {
    id: 'disponibilidade',
    title: '6. Disponibilidade e mudanças',
    content: (
      <>
        <p>
          A plataforma pode passar por manutenção, correções e alterações de funcionalidades.
          Serviços de terceiros e conexão à internet também podem afetar a disponibilidade. Não se
          promete funcionamento ininterrupto ou ausência total de falhas.
        </p>
        <p>
          Quando houver necessidade de restringir um acesso por segurança ou uso indevido, a medida
          deve ser proporcional ao risco. Sempre que possível e compatível com a proteção do
          serviço, serão informados o motivo e o caminho para esclarecimento.
        </p>
        <p>
          Não utilize a plataforma como canal de emergência ou substituto de orientação
          profissional. As responsabilidades por falhas e danos serão apuradas conforme a legislação
          aplicável, sem exclusão de direitos obrigatórios.
        </p>
      </>
    ),
  },
  {
    id: 'dados',
    title: '7. Privacidade e encerramento',
    content: (
      <>
        <p>
          O tratamento de dados é descrito na{' '}
          <Link href="/privacidade">Política de privacidade</Link>. Aceitar termos de uso não
          constitui autorização genérica para qualquer finalidade de tratamento ou para publicidade.
        </p>
        <p>
          Remover um vínculo com uma clínica, encerrar uma conta e cancelar um serviço ou assinatura
          são ações diferentes. Desinstalar um aplicativo ou deixar de acessar a plataforma não
          executa essas ações automaticamente.
        </p>
        <p>
          Solicitações de encerramento e de exercício de direitos serão tratadas pelo canal de
          atendimento confirmado. Alguns registros poderão precisar ser mantidos para cumprir
          obrigações ou resguardar direitos, conforme explicado na política.
        </p>
      </>
    ),
  },
  {
    id: 'atualizacoes',
    title: '8. Atualizações e legislação',
    content: (
      <>
        <p>
          A data e a versão no início desta página identificam o texto. Mudanças relevantes deverão
          ser comunicadas de forma adequada; quando necessário, haverá novo aceite antes da
          utilização do recurso afetado.
        </p>
        <p>
          Aplicam-se as leis brasileiras, inclusive as normas de proteção de dados e de defesa do
          consumidor quando cabíveis. Estes termos não impõem renúncia a direitos ou foro exclusivo
          que contrarie a legislação.
        </p>
        <p>
          Antes da abertura a clientes reais, serão completados os dados do responsável e o canal de
          contato, revisadas as condições comerciais e implementado o registro da versão aceita.
        </p>
      </>
    ),
  },
]

export default function TermsPage() {
  return (
    <LegalPage
      title="Termos de uso"
      intro="O que você precisa saber sobre sua conta, o uso da plataforma e as responsabilidades de cada parte."
      sections={sections}
    />
  )
}
