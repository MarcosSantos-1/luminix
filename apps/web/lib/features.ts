/**
 * Conteúdo da página /funcionalidades.
 * Para adicionar um tópico, inclua um item em `featureGroups`. Para ilustrar um tópico,
 * preencha `media` com um vídeo (URL de incorporação), GIF ou imagem em /public.
 * `status` controla o selo "Disponível" / "Em breve" — revise conforme os lançamentos.
 */

export type FeatureStatus = 'disponivel' | 'em-breve'

export type FeatureMedia =
  | { type: 'image' | 'gif'; src: string; alt: string }
  | { type: 'video'; src: string; title: string }

export type Feature = {
  id: string
  title: string
  status: FeatureStatus
  summary: string
  points: string[]
  media?: FeatureMedia
  faq?: { question: string; answer: string }[]
}

export type FeatureGroup = { title: string; features: Feature[] }

export const featureGroups: FeatureGroup[] = [
  {
    title: 'Começando',
    features: [
      {
        id: 'visao-geral',
        title: 'Visão geral',
        status: 'disponivel',
        summary:
          'O Luminix é um ecossistema de gestão para negócios de beleza e bem-estar: organiza o dia, cuida do dinheiro, atende seus clientes e ajuda a divulgar o seu trabalho.',
        points: [
          'Um painel para agenda, clientes, financeiro, estoque e equipe.',
          'Ferramentas de marketing para manter a agenda cheia.',
          'Funciona no navegador, no celular e no computador.',
        ],
        media: {
          type: 'image',
          src: '/landing/devices.webp',
          alt: 'Painel do Luminix em um notebook e em um celular',
        },
      },
      {
        id: 'primeiros-passos',
        title: 'Primeiros passos',
        status: 'disponivel',
        summary: 'O cadastro é guiado: uma etapa por vez, e você pode parar e continuar depois.',
        points: [
          'Crie a conta com e-mail e senha — sem cartão.',
          'Informe o perfil do espaço, serviços, equipe e horários.',
          'Revise e entre no painel.',
        ],
        faq: [
          {
            question: 'Quanto tempo leva?',
            answer: 'Com serviços e horários em mãos, poucos minutos.',
          },
        ],
      },
    ],
  },
  {
    title: 'Dia a dia',
    features: [
      {
        id: 'agenda',
        title: 'Agenda',
        status: 'disponivel',
        summary: 'Veja o dia de cada profissional e marque atendimentos sem conflito de horário.',
        points: [
          'Visualização por dia e por profissional.',
          'Horários de funcionamento do espaço respeitados automaticamente.',
          'Status do atendimento: agendado, confirmado, concluído.',
        ],
        faq: [
          {
            question: 'Dá para bloquear horários?',
            answer: 'Sim. Os horários fora do funcionamento do espaço não ficam disponíveis.',
          },
        ],
      },
      {
        id: 'clientes',
        title: 'Clientes',
        status: 'disponivel',
        summary: 'O cadastro de quem você atende, com contato e histórico em um só lugar.',
        points: [
          'Cadastro em etapas, sem formulário gigante.',
          'Busca por nome ou telefone.',
          'Histórico de atendimentos por cliente.',
        ],
      },
      {
        id: 'servicos',
        title: 'Serviços e pacotes',
        status: 'disponivel',
        summary: 'Seu catálogo com nome, duração e preço — a base da agenda e do financeiro.',
        points: [
          'Sugestões de serviços por tipo de negócio.',
          'Duração define o tamanho do horário na agenda.',
          'Pacotes e promoções para vender mais de uma sessão.',
        ],
      },
      {
        id: 'equipe',
        title: 'Equipe e acessos',
        status: 'disponivel',
        summary: 'Cada pessoa da equipe com seu acesso, seus horários e seu nível de permissão.',
        points: [
          'Níveis prontos: quem gerencia, quem atende, quem recepciona.',
          'Horários individuais por profissional.',
          'Você decide quem vê o quê.',
        ],
      },
      {
        id: 'salas',
        title: 'Salas e equipamentos',
        status: 'disponivel',
        summary: 'Salas, macas e aparelhos entram na conta para evitar ocupação dupla.',
        points: [
          'Cadastre os ambientes do seu espaço.',
          'Vincule serviços que dependem de uma sala ou aparelho.',
        ],
      },
      {
        id: 'estoque',
        title: 'Estoque',
        status: 'disponivel',
        summary: 'Saiba o que tem, o que está acabando e o que cada atendimento consome.',
        points: ['Cadastro de produtos e quantidades.', 'Aviso de itens perto do fim.'],
      },
    ],
  },
  {
    title: 'Dinheiro',
    features: [
      {
        id: 'financeiro',
        title: 'Financeiro',
        status: 'disponivel',
        summary: 'Entradas e saídas do espaço organizadas, sem planilha paralela.',
        points: [
          'Receitas por atendimento, pacote e profissional.',
          'Despesas e contas do espaço.',
          'Comissões da equipe.',
        ],
      },
      {
        id: 'relatorios',
        title: 'Relatórios',
        status: 'disponivel',
        summary: 'Os números do seu negócio em gráficos simples de ler.',
        points: [
          'Faturamento por período.',
          'Serviços mais vendidos.',
          'Clientes novos e clientes que voltaram.',
        ],
      },
      {
        id: 'pagamentos',
        title: 'Pagamentos e sinal',
        status: 'em-breve',
        summary: 'Cobrança online e sinal para garantir o horário.',
        points: ['Sinal na reserva.', 'Regras de cancelamento e falta.'],
      },
    ],
  },
  {
    title: 'Marketing',
    features: [
      {
        id: 'pagina-do-espaco',
        title: 'Página do seu espaço',
        status: 'disponivel',
        summary: 'Um endereço próprio com serviços, fotos e contato. Você publica quando quiser.',
        points: [
          'Galeria de fotos e lista de serviços.',
          'Links para WhatsApp e redes sociais.',
          'Paleta de cores e logo com a cara do seu negócio.',
        ],
        media: {
          type: 'image',
          src: '/landing/sala.webp',
          alt: 'Sala de atendimento usada como capa de uma página de espaço',
        },
      },
      {
        id: 'campanhas',
        title: 'Campanhas e promoções',
        status: 'disponivel',
        summary: 'Planeje suas ações do mês e não perca nenhuma data importante.',
        points: [
          'Calendário de campanhas com datas do setor.',
          'Promoções ligadas aos seus serviços.',
          'Dicas de postagem para cada momento.',
        ],
      },
      {
        id: 'fotos',
        title: 'Fotos e mídias',
        status: 'disponivel',
        summary: 'Antes e depois, portfólio e fotos do espaço guardados e organizados.',
        points: ['Fotos por cliente e por atendimento.', 'Galeria para usar na sua página.'],
      },
      {
        id: 'imagens-ia',
        title: 'Imagens por IA',
        status: 'em-breve',
        summary: 'Artes para posts e campanhas criadas a partir de uma descrição.',
        points: ['Modelos para datas comemorativas.', 'Imagens no estilo do seu espaço.'],
      },
    ],
  },
  {
    title: 'Seus clientes',
    features: [
      {
        id: 'whatsapp-ia',
        title: 'WhatsApp com IA',
        status: 'em-breve',
        summary: 'Um atendente virtual que responde seus clientes e marca horários por você.',
        points: [
          'Agendamento direto pela conversa.',
          'Confirmações e lembretes automáticos.',
          'Mensagem para aniversariantes.',
        ],
      },
      {
        id: 'app-do-cliente',
        title: 'App do cliente',
        status: 'em-breve',
        summary: 'Seus clientes instalam o app e acompanham horários e pacotes pelo celular.',
        points: [
          'Aplicativo instalável, com a marca do seu espaço.',
          'Um acesso para todos os espaços que a pessoa frequenta.',
        ],
      },
      {
        id: 'anamnese',
        title: 'Anamnese digital',
        status: 'em-breve',
        summary: 'Fichas de avaliação preenchidas e guardadas junto ao cadastro do cliente.',
        points: ['Modelos por tipo de atendimento.', 'Histórico de evolução.'],
      },
    ],
  },
]

export const allFeatures = featureGroups.flatMap((group) => group.features)
