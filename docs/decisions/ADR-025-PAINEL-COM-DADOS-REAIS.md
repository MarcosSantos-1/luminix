# ADR-025 — Painel com dados reais: serviços, promoções, financeiro, estoque e relatórios

- Data: 2026-11-09
- Estado: implementado; migration 0027

## Contexto

Início, Serviços, Financeiro, Estoque, Marketing e Relatórios mostravam exemplos fixos. Não havia
edição do catálogo depois do onboarding, preço guardado no agendamento, status de atendimento,
livro financeiro nem estoque.

## Decisão

- **Catálogo** (`modules/catalog`): `save_service` cria/edita (nome único entre ativos),
  `set_service_status` pausa/reativa (mantém ao menos um ativo). Toda escrita expira o cache do
  site. Novo serviço pode começar de uma sugestão de `lib/service-catalog.json` (o mesmo catálogo
  do onboarding).
- **Promoções**: `promotions` + `promotion_services`, desconto em % (1–90), período, pausa,
  encerramento e “mostrar no site”. `service_promotion()` escolhe a maior promoção ativa do dia
  (fuso de São Paulo); serviços “sob consulta” nunca entram. O site mostra preço riscado e selo.
- **Atendimentos**: trigger guarda `list_price_cents`, `price_cents` (com promoção) e
  `promotion_id` no momento da marcação; mudar o catálogo depois não altera o combinado.
  `set_appointment_status` (agenda:manage) permite concluir, marcar falta, cancelar.
  Corrige a 0025: `create_manager_appointment` passa a exigir `agenda:manage` (a recepção
  não conseguia marcar).
- **Financeiro** (`modules/finance`, `finance:manage`): livro de entradas/saídas com categoria e
  forma; lançamentos são anulados (`void`), nunca apagados. Atendimentos concluídos sem entrada
  aparecem em “a lançar”; índice único impede lançar o mesmo atendimento duas vezes. Previsão do mês
  pelos agendamentos futuros. Pagamentos online (Stripe) ainda não entram aqui (TD-008).
- **Estoque** (`modules/inventory`, `inventory:manage`): produtos com unidade, mínimo e custo;
  movimentos entrada/saída/contagem com saldo, nunca negativo.
- **Insights** (`modules/insights`): `dashboard` (agenda do dia, números, alertas, atividade do
  registro de auditoria via `list_recent_activity`), `reports` (período até 366 dias) e
  `marketing` (aniversariantes do mês e clientes sem visita há 60 dias). Cada bloco só aparece
  com a permissão correspondente (a recepção vê o dia, não o dinheiro).
- Permissões novas: `finance:manage` (proprietária, gerente) e `inventory:manage` (proprietária,
  gerente, recepção).
- Admin: seções em `components/manager/business/*`, ligadas ao `ManagerHome` pela prop `panels`
  (seção real substitui o esboço; o “+” do topo abre o formulário da seção).

## Consequências

- Ordem: migration 0027 → API → web/admin. A web antiga ignora os campos de promoção.
- Relatórios usam preço guardado no agendamento e lançamentos do livro; não há conciliação com
  cobranças reais ainda.
- Mensagens de marketing abrem o WhatsApp com texto pronto; envio automático depende de provedor
  (PR10).

## Validação

`tests/business.test.ts`: serviço novo/edição refletidos no site, nome duplicado 409, recepção e
outra clínica 403, pausa remove do site e mantém um ativo; promoção 20% no site e congelada no
atendimento (recepção marcando), serviço de outra clínica 400, pausa remove desconto; concluir
atendimento → “a lançar” → lançamento único (409 no repetido) → totais e relatório; painel do dia
sem dinheiro para a recepção; estoque com saída acima do saldo recusada e contagem; aniversariantes.
