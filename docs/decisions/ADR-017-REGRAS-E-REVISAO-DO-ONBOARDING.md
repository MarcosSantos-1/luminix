# ADR-017 — Regras e revisão do onboarding

Status: Accepted.

Data: 2026-10-25.

Evolução: a [ADR-018](ADR-018-CANCELAMENTO-TARDIO-E-FALTAS.md) substitui o bloqueio de
cancelamento após o prazo pela classificação de aviso tardio e acrescenta preferências de
retenção para avulsos. A execução automática continua pendente.

## Decisão

Regras passa a reunir antecedência mínima para agendar, horizonte de agenda, cancelamento,
remarcação e orientações gerais opcionais. Recebimento de pacotes pertence à etapa Pagamentos.
O prazo de cancelamento especial só aparece quando existem serviços com `manual_release`;
valores previamente salvos são preservados mesmo quando a seção fica oculta.

A configuração é persistida, mas não ativa agendamento público, notificações, multas,
desconto de sessões ou cobranças. A interface informa essa fronteira. O motor de agendamento
para clientes deverá consumir `booking_policies`, nunca o rascunho do onboarding.

Campos novos são opcionais no contrato v3 para preservar clientes antigos. A interface sugere
2 horas de antecedência e horizonte de 60 dias para novos cadastros. A migration 0017 adiciona
colunas na tabela existente, preservando RLS, auditoria, autorização e a conclusão transacional.
Um trigger de conclusão materializa somente as preferências da clínica do rascunho autorizado.
Clínicas antigas permanecem com os novos limites nulos, sem impor uma política retroativamente.

`rescheduling_notice_minutes = NULL` significa acompanhar o prazo de cancelamento aplicável ao
serviço (incluindo exceções individuais e serviços especiais). Um número significa prazo próprio
de remarcação para todos os serviços. Orientações usam texto simples, até 500 caracteres, sem HTML.
O endpoint de configurações autorizado expõe as regras materializadas.

Finalizar agrupa o resumo por assunto e oferece edição das etapas 1–8. Ao editar pelo resumo,
Continuar salva e retorna diretamente à revisão. Concluir salva os dados revisados que diferirem
do rascunho antes de chamar a conclusão com a versão retornada. Falhas de salvamento impedem
conclusão; conflitos de versão continuam exigindo recarga. Não há promessa de publicação pública.

## Riscos e recuperação

A migration é aditiva. O ALTER exige lock breve na tabela; o runner limita espera a cinco segundos.
Não remove registros nem altera os prazos existentes. As linhas existentes recebem campos novos
nulos e recado vazio. A API anterior ignora os campos novos; publicar banco antes da API e admin.
Para recuperação, reverter a aplicação e manter as colunas. Qualquer remoção posterior exige nova
migration e preservação dos valores; não editar migrations aplicadas.

A aplicação operacional das regras e publicação do recado continuam pendentes, registradas na
TD-009. FAQ usa Accordion HeroUI; inputs reutilizam GlassSelect e TextField/TextArea HeroUI.
Ilustrações existentes são decorativas; ações possuem rótulos e estados de indisponibilidade.

## Operação e validação

Migration 0017 aplicada no Neon principal autorizado em 2026-10-25, em
`ep-bitter-fog-acchavo1.sa-east-1.aws.neon.tech/neondb`. Havia uma política cadastrada;
nenhum prazo existente foi substituído. Verificação do runner cobriu RLS, FK entre clínicas,
contexto ausente, constraints e auditoria, com rollback dos dados sintéticos.

A entrega isolada passou em TypeScript e builds de admin/API, 98 testes da API com um worker
e 10 testes do admin. A prévia com fixture sintética foi conferida no navegador em desktop e
390 px, incluindo seleção por teclado, recado, resumo e FAQ. O fluxo autenticado completo em
produção ainda precisa de conferência manual. O check agregado permanece limitado pela
formatação/lint preexistentes registrados na TD-007.
