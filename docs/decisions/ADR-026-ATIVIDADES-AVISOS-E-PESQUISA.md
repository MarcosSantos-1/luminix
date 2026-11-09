# ADR-026: Atividades, avisos e pesquisa no painel

- Data: 2026-11-09
- Estado: implementado; migration 0028

## Contexto

O Início mostrava as últimas atividades sem ação nenhuma. O sino abria só as novidades da Luminix,
e a pesquisa listava páginas e exemplos fixos. Faltavam três coisas: um lugar para ver tudo que
aconteceu e organizar (ler, arquivar, apagar), avisos do que precisa de atenção e uma pesquisa
que encontre clientes, serviços e ajustes de verdade.

## Decisão

- **Atividades** (`modules/workspace`, `audit:read`): a fonte é o `audit_logs`, que continua
  imutável. "Lida", "arquivada" e "apagada" são estados por pessoa em `activity_states`
  (RLS por clínica). Por isso apagar só some da lista de quem apagou: as outras pessoas e o
  histórico continuam iguais.
  - `list_activity` traz o nome legível de cada item via `activity_text`.
  - `unread_activity_count` conta os últimos 30 dias, sem as ações da própria pessoa.
  - `set_activity_state` aceita até 200 ids ou "todas".
  - `activity_states` não tem chave estrangeira para `audit_logs`: assim a tabela de auditoria
    não passa a depender de estado de tela. A integridade vem da função, que só grava ids da
    própria clínica.
- **Central de atividades** (admin `workspace/activity-center.tsx`): um Drawer com caixa de
  entrada e arquivadas, filtro por tipo, seleção em massa e ações por linha. Clicar num item abre
  a página dele.
- **Avisos** (`GET /clinics/:id/notices`): calculados no servidor conforme as permissões de quem
  vê. Exemplos: site fora do ar, atendimentos passados sem conclusão, valores a lançar, estoque
  baixo, serviço sem profissional, promoção acabando e aniversariantes. No painel aparecem em um
  carrossel no topo, um por vez, com setas e passos ("2 de 4"). Dispensar fica guardado no
  navegador por clínica. Os ids levam a data, então o aviso volta no dia seguinte se o problema
  continuar.
- **Sino**: mostra os avisos e as atividades não lidas, permite marcar tudo como lido e dá acesso
  a "Ver todas" e às "Novidades da Luminix". Atualiza a cada minuto. Quem não tem `audit:read`
  vê só os avisos.
- **Pesquisa** (`GET /clinics/:id/search?q=`, 2 a 80 caracteres): busca sem acento
  (`luminix.fold`) em clientes (também pelos dígitos do telefone), serviços, promoções,
  agendamentos, equipe, estoque, financeiro e mídia. Cada grupo só aparece com a permissão
  correspondente.
  - No admin, `workspace/search-index.ts` indexa as páginas, as abas de configuração, cada
    ajuste (logo, CEP, WhatsApp, endereço do site, sinal, idioma, convidar funcionário, horários
    da equipe…) com sinônimos, e atalhos de criação.
  - O que pertence à página atual aparece primeiro, em "Nesta página".
  - Abrir um resultado leva à página e à aba certas. Em Serviços, Estoque e Clientes, a busca da
    página já vem preenchida (`useSearchFocus`). Nas configurações, o campo é rolado até a tela,
    destacado e focado.
  - Dá para navegar pelos resultados com ↑ ↓ e Enter.

## Consequências

- Nenhuma escrita no `audit_logs`. Retenção e expurgo continuam valendo para ele. Estados
  órfãos em `activity_states` não afetam as listas, porque elas sempre partem do `audit_logs`.
- A pesquisa usa ILIKE sem índice dedicado. Isso basta para o volume de uma clínica; se crescer,
  dá para usar trigram (`pg_trgm`) nas colunas dobradas.
- Dispensar um aviso vale só naquele navegador. Isso é intencional: os avisos são lembretes, não
  tarefas.
