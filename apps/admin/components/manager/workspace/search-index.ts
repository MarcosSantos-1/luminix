import type { ManagerSettingsSection } from '../manager-settings-nav'

/** Something you can find without asking the server: pages, settings and shortcuts. */
export type IndexEntry = {
  id: string
  title: string
  detail: string
  /** Extra words people may type (synonyms, plain-language names). */
  keywords?: string
  section: string
  tab?: ManagerSettingsSection
  /** Visible text on the destination page to scroll to and highlight. */
  anchor?: string
  /** Opens the "+" form of the page. */
  create?: boolean
}

const setting = (
  tab: ManagerSettingsSection,
  title: string,
  detail: string,
  keywords = '',
  anchor = title,
): IndexEntry => ({
  id: `setting-${tab}-${title}`,
  title,
  detail,
  keywords,
  section: 'configuracoes',
  tab,
  anchor,
})

/** Every setting a person may look for, pointing to the tab and the field on it. */
export const settingsIndex: IndexEntry[] = [
  setting(
    'espaco',
    'Logo',
    'Dados do espaço',
    'logotipo marca imagem foto',
    'Identidade do espaço',
  ),
  setting('espaco', 'Nome do espaço', 'Dados do espaço', 'nome clínica salão estúdio'),
  setting('espaco', 'Público atendido', 'Dados do espaço', 'mulheres homens crianças'),
  setting('espaco', 'Ano de fundação', 'Dados do espaço', 'desde quando fundado'),
  setting(
    'espaco',
    'Endereço',
    'Dados do espaço',
    'rua avenida número bairro cidade estado mapa local',
  ),
  setting('espaco', 'CEP', 'Dados do espaço · Endereço', 'código postal'),
  setting('espaco', 'Código do espaço', 'Dados do espaço', 'código acesso compartilhar'),
  setting('contato', 'Nome da responsável', 'Contato', 'dona dono responsável proprietária'),
  setting('contato', 'E-mail', 'Contato', 'email correio'),
  setting('contato', 'Telefone', 'Contato', 'celular fone'),
  setting('contato', 'WhatsApp do espaço', 'Contato', 'zap whats mensagem'),
  setting('contato', 'Instagram', 'Contato', 'insta rede social'),
  setting('contato', 'Facebook', 'Contato', 'face rede social'),
  setting('contato', 'Site próprio', 'Contato', 'site página link'),
  setting(
    'vitrine',
    'Endereço do site',
    'Vitrine e site',
    'link url slug nome do site trocar endereço',
  ),
  setting('vitrine', 'Site no ar', 'Vitrine e site', 'publicar desligar fora do ar online ativar'),
  setting(
    'vitrine',
    'Editar o site',
    'Vitrine e site',
    'vitrine aparência fotos textos editor',
    'O que aparece no site',
  ),
  setting('vitrine', 'Mostrar endereço e mapa', 'Vitrine e site', 'esconder endereço'),
  setting('vitrine', 'Mostrar WhatsApp e redes sociais', 'Vitrine e site', 'esconder contato'),
  setting(
    'regras',
    'Regras e combinados',
    'Regras',
    'atraso cancelamento falta política',
    'Recado para as clientes',
  ),
  setting(
    'regras',
    'Sinal',
    'Regras',
    'adiantamento entrada pagamento antecipado reserva',
    'Recado para as clientes',
  ),
  setting(
    'personalizacao',
    'Cores do painel',
    'Personalização',
    'tema cor rosa escuro claro aparência',
  ),
  setting(
    'personalizacao',
    'Idioma',
    'Personalização',
    'língua português inglês espanhol bandeira',
  ),
  setting(
    'equipe',
    'Profissionais',
    'Equipe e horários',
    'equipe funcionária cabeleireira manicure',
  ),
  setting(
    'equipe',
    'Adicionar profissional',
    'Equipe e horários',
    'nova profissional contratar',
    'Profissionais',
  ),
  setting(
    'equipe',
    'Horários da equipe',
    'Equipe e horários',
    'expediente folga dias pausa almoço',
    'Dias e horários',
  ),
  setting(
    'equipe',
    'Você também atende?',
    'Equipe e horários',
    'eu atendo gestora como profissional',
  ),
  setting(
    'acessos',
    'Convidar funcionário',
    'Acessos e logins',
    'convite acesso login senha e-mail',
    'Dar acesso a alguém',
  ),
  setting('acessos', 'Pessoas com acesso', 'Acessos e logins', 'inativar remover reenviar senha'),
  setting(
    'acessos',
    'Níveis de acesso',
    'Acessos e logins',
    'permissão gerente recepção profissional',
  ),
  setting('rotina', 'Agenda e expediente', 'Rotina', 'horário funcionamento abre fecha'),
  setting('rotina', 'Pagamentos', 'Rotina', 'pix cartão receber stripe conta'),
]

/** Words for each page, so "dinheiro" finds Financeiro and "fotos" finds Mídia. */
export const pageKeywords: Record<string, string> = {
  inicio: 'home começo resumo hoje',
  agenda: 'horário marcação agendamento atendimento calendário',
  clientes: 'cliente pessoas cadastro aniversário',
  servicos: 'serviço preço valor promoção desconto catálogo',
  financeiro: 'dinheiro caixa entrada saída despesa receita pagamento',
  relatorios: 'relatório gráfico resultado números mês',
  estoque: 'produto material quantidade acabando',
  marketing: 'divulgar campanha mensagem aniversário cupom',
  midia: 'foto imagem galeria antes e depois acervo',
  configuracoes: 'ajustes preferências conta',
}

/** Shortcuts that open the "+" form of a page. */
export const createShortcuts: IndexEntry[] = [
  {
    id: 'create-agenda',
    title: 'Novo agendamento',
    detail: 'Agenda',
    section: 'agenda',
    create: true,
    keywords: 'marcar horário',
  },
  {
    id: 'create-clientes',
    title: 'Adicionar cliente',
    detail: 'Clientes',
    section: 'clientes',
    create: true,
    keywords: 'cadastrar nova cliente',
  },
  {
    id: 'create-servicos',
    title: 'Novo serviço',
    detail: 'Serviços',
    section: 'servicos',
    create: true,
    keywords: 'criar serviço',
  },
  {
    id: 'create-financeiro',
    title: 'Novo lançamento',
    detail: 'Financeiro',
    section: 'financeiro',
    create: true,
    keywords: 'despesa receita gasto',
  },
  {
    id: 'create-estoque',
    title: 'Novo produto',
    detail: 'Estoque',
    section: 'estoque',
    create: true,
    keywords: 'cadastrar produto',
  },
]

export function fold(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Scores an entry: title start > title word > keywords; 0 means no match. */
export function score(entry: Pick<IndexEntry, 'title' | 'detail' | 'keywords'>, needle: string) {
  if (!needle) return 1
  const title = fold(entry.title)
  if (title.startsWith(needle)) return 4
  if (title.split(/\s+/).some((word) => word.startsWith(needle))) return 3
  if (title.includes(needle)) return 2
  const words = needle.split(/\s+/)
  const haystack = fold(`${entry.title} ${entry.detail} ${entry.keywords ?? ''}`)
  return words.every((word) => haystack.includes(word)) ? 1 : 0
}
