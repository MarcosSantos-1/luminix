/**
 * Páginas de destino para anúncios (Instagram/Facebook), uma por público.
 * Cada item vira uma rota em /para/<slug>. Para criar uma nova, adicione um item aqui.
 */

type AdImage = { src: string; alt: string; width: number; height: number; position?: string }

export type AdPage = {
  slug: string
  /** 'graphite' deixa a página escura (usada em tatuagem). */
  theme?: 'graphite'
  metaTitle: string
  metaDescription: string
  kicker: string
  title: string
  titleMark: string
  lead: string
  hero: AdImage
  chips: { label: string; text: string }[]
  pains: { title: string; text: string }[]
  band: { title: string; text: string; points: string[]; image: AdImage }
  faq: { question: string; answer: string }[]
}

const portrait = { width: 928, height: 878 }
const closeUp = { width: 1000, height: 908 }

export const adPages: AdPage[] = [
  {
    slug: 'seu-espaco',
    metaTitle: 'Gestão completa para o seu espaço',
    metaDescription:
      'Agenda, clientes, financeiro, estoque, equipe e marketing em um só sistema. 12 dias grátis, sem cartão.',
    kicker: 'Para studios, salões, espaços e clínicas',
    title: 'Seu espaço inteiro',
    titleMark: 'num só lugar.',
    lead: 'Agenda, clientes, financeiro, estoque, equipe e marketing em um sistema prático e bonito.',
    hero: {
      src: '/landing/hero.webp',
      alt: 'Profissional de estética sorrindo em sua clínica',
      width: 1392,
      height: 1130,
      position: '42% 30%',
    },
    chips: [
      { label: 'Hoje', text: '8 atendimentos' },
      { label: 'Caixa', text: 'R$ 1.240,00' },
    ],
    pains: [
      {
        title: 'Tudo no mesmo lugar',
        text: 'Chega de caderno, planilha e cinco aplicativos diferentes.',
      },
      {
        title: 'Dinheiro sob controle',
        text: 'Entradas, saídas e comissões fechadas sem dor de cabeça.',
      },
      {
        title: 'Agenda sempre cheia',
        text: 'Campanhas, dicas de post e lembretes para o cliente voltar.',
      },
    ],
    band: {
      title: 'Mais tempo para atender.',
      text: 'O Luminix cuida da parte chata para você cuidar de quem está na sua frente.',
      points: [
        'Agenda de toda a equipe',
        'Ficha e histórico de cada cliente',
        'Estoque e financeiro integrados',
        'Página própria do seu espaço',
      ],
      image: {
        src: '/landing/atendimento2.webp',
        alt: 'Esteticista atendendo uma cliente',
        width: 1000,
        height: 1075,
      },
    },
    faq: [
      {
        question: 'Serve para o meu tipo de negócio?',
        answer:
          'Se você atende com hora marcada, serve. Serviços, equipe e horários são configurados do seu jeito.',
      },
      {
        question: 'Preciso de cartão para testar?',
        answer: 'Não. Você cria a conta e usa por 12 dias. Depois, paga no Pix ou no cartão.',
      },
      {
        question: 'Preciso instalar alguma coisa?',
        answer: 'Não. O Luminix abre no navegador do celular e do computador.',
      },
    ],
  },
  {
    slug: 'tatuagem',
    theme: 'graphite',
    metaTitle: 'Gestão para studios de tatuagem',
    metaDescription:
      'Agenda por artista, portfólio, estoque e financeiro do studio em um só sistema. 12 dias grátis, sem cartão.',
    kicker: 'Para studios de tatuagem e piercing',
    title: 'Sua arte na pele.',
    titleMark: 'A gestão com a gente.',
    lead: 'Agenda por artista, portfólio, estoque e financeiro do studio em um sistema só.',
    hero: {
      src: '/landing/studio.webp',
      alt: 'Tatuador de braços cruzados em seu estúdio',
      ...portrait,
      position: '50% 0',
    },
    chips: [
      { label: 'Sábado', text: 'Sessão de 5h · fechamento' },
      { label: 'Agenda', text: '3 artistas · 7 sessões' },
    ],
    pains: [
      {
        title: 'Sessão longa sem furo',
        text: 'Agenda por artista, com a duração real de cada trabalho.',
      },
      {
        title: 'Orçamento que não se perde',
        text: 'Cliente, referência e histórico guardados na mesma ficha.',
      },
      {
        title: 'Quanto cada artista rendeu',
        text: 'Financeiro e comissões fechados sem planilha.',
      },
    ],
    band: {
      title: 'Seu portfólio trabalhando por você.',
      text: 'Fotos organizadas, página do studio e ideias de post para manter a agenda cheia.',
      points: [
        'Galeria de trabalhos por artista',
        'Página própria do studio',
        'Calendário de flash days e campanhas',
        'Estoque de tintas e descartáveis',
      ],
      image: {
        src: '/landing/tattoo.webp',
        alt: 'Tatuadora trabalhando em um braço',
        ...closeUp,
      },
    },
    faq: [
      {
        question: 'Funciona para studio com vários artistas?',
        answer: 'Sim. Cada artista tem sua agenda, seus horários e seu acesso.',
      },
      {
        question: 'Dá para cobrar sinal?',
        answer:
          'O sinal online está chegando. Hoje você registra o valor recebido no financeiro do studio.',
      },
      {
        question: 'Preciso de cartão para testar?',
        answer: 'Não. Você usa por 12 dias e, se continuar, paga no Pix ou no cartão.',
      },
    ],
  },
  {
    slug: 'estetica',
    metaTitle: 'Gestão para clínicas de estética e massoterapia',
    metaDescription:
      'Fichas, salas, pacotes e financeiro para clínicas de estética, massoterapeutas e quiropraxistas. 12 dias grátis, sem cartão.',
    kicker: 'Para estética, massoterapia e quiropraxia',
    title: 'Você cuida das pessoas.',
    titleMark: 'O Luminix cuida da clínica.',
    lead: 'Fichas, salas, pacotes de sessões e financeiro em um sistema feito para quem atende.',
    hero: {
      src: '/landing/clinica.webp',
      alt: 'Esteticista de jaleco branco em uma clínica',
      ...portrait,
      position: '50% 0',
    },
    chips: [
      { label: 'Pacote', text: 'Sessão 4 de 10 · drenagem' },
      { label: 'Sala 02', text: 'Livre às 15h' },
    ],
    pains: [
      {
        title: 'Ficha completa de cada cliente',
        text: 'Histórico, observações e fotos de evolução no mesmo lugar.',
      },
      {
        title: 'Salas e aparelhos sem conflito',
        text: 'O sistema não deixa marcar dois atendimentos na mesma maca.',
      },
      {
        title: 'Pacotes sob controle',
        text: 'Saiba quantas sessões faltam e quanto já entrou.',
      },
    ],
    band: {
      title: 'Clientes que voltam.',
      text: 'Relacionamento em dia sem você precisar lembrar de tudo.',
      points: [
        'Mensagem para aniversariantes',
        'Campanhas para cada época do ano',
        'Relatório de quem sumiu e quem voltou',
        'Página própria do seu espaço',
      ],
      image: {
        src: '/landing/atendimento.webp',
        alt: 'Esteticista fazendo um tratamento facial',
        width: 1000,
        height: 1075,
      },
    },
    faq: [
      {
        question: 'Atendo sozinha. Vale a pena?',
        answer: 'Vale. O sistema funciona igual para uma profissional ou para uma equipe inteira.',
      },
      {
        question: 'Tem ficha de anamnese?',
        answer:
          'A anamnese digital está chegando. Hoje você já guarda histórico e observações de cada cliente.',
      },
      {
        question: 'Preciso de cartão para testar?',
        answer: 'Não. Você usa por 12 dias e, se continuar, paga no Pix ou no cartão.',
      },
    ],
  },
  {
    slug: 'cabeleireiras',
    metaTitle: 'Gestão para cabeleireiras e salões',
    metaDescription:
      'Agenda da equipe, comissões, estoque e financeiro do salão em um só sistema. 12 dias grátis, sem cartão.',
    kicker: 'Para cabeleireiras e salões',
    title: 'Cadeira cheia,',
    titleMark: 'cabeça leve.',
    lead: 'Agenda da equipe, comissões, estoque e financeiro do salão em um sistema só.',
    hero: {
      src: '/landing/salao.webp',
      alt: 'Cabeleireira sorrindo em um salão com espelhos iluminados',
      ...portrait,
      position: '50% 0',
    },
    chips: [
      { label: '14:00', text: 'Mechas + corte · 3h' },
      { label: 'Comissão', text: 'Semana fechada' },
    ],
    pains: [
      {
        title: 'A agenda de todo mundo',
        text: 'Cada profissional com seus horários, em uma tela só.',
      },
      {
        title: 'Comissão sem discussão',
        text: 'O sistema calcula quanto cada uma produziu.',
      },
      {
        title: 'Coloração que não falta',
        text: 'Estoque avisando antes de o produto acabar.',
      },
    ],
    band: {
      title: 'Seu salão sempre lembrado.',
      text: 'Ferramentas para trazer a cliente de volta antes que a raiz apareça.',
      points: [
        'Campanhas para datas do ano',
        'Dicas de postagem prontas',
        'Fotos de antes e depois organizadas',
        'Página própria do seu salão',
      ],
      image: {
        src: '/landing/lavatorio.webp',
        alt: 'Cliente relaxando durante a lavagem no salão',
        ...closeUp,
      },
    },
    faq: [
      {
        question: 'Funciona para quem aluga cadeira?',
        answer: 'Sim. Cada profissional tem agenda e acesso próprios dentro do mesmo salão.',
      },
      {
        question: 'Controla serviços longos, como mechas?',
        answer: 'Sim. Cada serviço tem sua duração e ocupa o tempo certo na agenda.',
      },
      {
        question: 'Preciso de cartão para testar?',
        answer: 'Não. Você usa por 12 dias e, se continuar, paga no Pix ou no cartão.',
      },
    ],
  },
  {
    slug: 'manicures',
    metaTitle: 'Gestão para manicures e nail designers',
    metaDescription:
      'Agenda, clientes, financeiro e divulgação para manicures e nail designers. 12 dias grátis, sem cartão.',
    kicker: 'Para manicures e nail designers',
    title: 'Mãos ocupadas?',
    titleMark: 'O Luminix organiza.',
    lead: 'Horários, clientes, dinheiro e divulgação resolvidos enquanto você atende.',
    hero: {
      src: '/landing/manicure.webp',
      alt: 'Manicure sorrindo em seu espaço de atendimento',
      ...portrait,
      position: '50% 0',
    },
    chips: [
      { label: 'Manutenção', text: '5 clientes na hora de voltar' },
      { label: 'Mês', text: 'R$ 4.380,00' },
    ],
    pains: [
      {
        title: 'Horário certo para cada serviço',
        text: 'Esmaltação, alongamento e manutenção, cada um com sua duração.',
      },
      {
        title: 'Manutenção que não esquece',
        text: 'Saiba quem está na hora de voltar.',
      },
      {
        title: 'Quanto entrou no mês',
        text: 'Financeiro simples, sem caderninho.',
      },
    ],
    band: {
      title: 'Seu trabalho merece vitrine.',
      text: 'Suas melhores unhas organizadas e prontas para virar post.',
      points: [
        'Galeria de fotos do seu trabalho',
        'Dicas de postagem prontas',
        'Campanhas para datas do ano',
        'Página própria com seus serviços',
      ],
      image: {
        src: '/landing/unhas.webp',
        alt: 'Manicure finalizando unhas em tom rosé',
        ...closeUp,
      },
    },
    faq: [
      {
        question: 'Atendo sozinha, em casa. Serve?',
        answer: 'Serve. Você não precisa ter salão nem equipe para usar.',
      },
      {
        question: 'É difícil de mexer?',
        answer: 'Não. O cadastro é guiado e você usa pelo celular.',
      },
      {
        question: 'Preciso de cartão para testar?',
        answer: 'Não. Você usa por 12 dias e, se continuar, paga no Pix ou no cartão.',
      },
    ],
  },
]

export function findAdPage(slug: string): AdPage | undefined {
  return adPages.find((page) => page.slug === slug)
}
