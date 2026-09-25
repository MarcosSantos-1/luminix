# ADR-013 — Onboarding completo da clínica

Status: Accepted

Data: 2026-09-24

## Contexto

A primeira versão persistia contato, nome, ocupações, serviços básicos e nomes de profissionais.
Ela validou retomada, concorrência e isolamento, mas não produzia configuração suficiente para a
agenda do cliente. O catálogo inicial também exigia digitação manual.

## Decisão

O onboarding passa ao `format_version = 2`, mantendo `onboarding_drafts.payload` apenas como rascunho
versionado e limitado a 128 KiB. Na conclusão transacional, os dados são materializados em entidades
tenant-aware: perfil e contatos da clínica, local principal, horário de funcionamento, ocupações,
serviços, profissionais, vínculos profissional-serviço, recursos especiais, políticas de reserva e
preferências de pagamento.

O fluxo possui oito etapas curtas: contato, clínica, catálogo, detalhes dos serviços, equipe,
agenda/endereço, regras/pagamentos e revisão. O catálogo anexado ao projeto oferece sugestões de
descrição, duração e preço; cada seleção cria uma cópia pertencente à clínica, portanto mudanças
futuras no catálogo não alteram serviços já configurados.

Serviços suportam preço fixo, “a partir de” ou sob consulta; confirmação imediata, por solicitação ou
liberação manual; público atendido e recurso/máquina opcional. A restrição de público é configuração
do serviço/profissional, nunca regra global. A liberação manual representa equipamentos alugados sem
antecipar um motor genérico de recorrência.

Equipe “somente eu” cria a proprietária como profissional e vincula os serviços selecionados.
Contas, convites e permissões de recepção continuam no fluxo seguro pós-onboarding. Horários
individuais também ficam para a configuração posterior; o horário do local é a base inicial.

Preferência por Stripe Connect e forma de recebimento de pacotes são persistidas, mas não criam conta
conectada nem cobrança. SMS, upload da logo e importação de tabela por IA não são simulados: a UI os
identifica como próximos passos dependentes das integrações correspondentes.

Todas as novas tabelas possuem RLS forçada, imutabilidade de `clinic_id`, auditoria e chaves compostas
tenant-aware. A função `complete_onboarding` continua `SECURITY DEFINER`, exige contexto validado,
membership ativo e `onboarding:manage`, e permanece idempotente após sucesso.

## Consequências

- Pelo menos um serviço é obrigatório para concluir, mas rascunhos iniciais vazios continuam válidos.
- Endereço, documento e redes sociais são opcionais; contato, nome, serviço e horário válido são
  revalidados no backend.
- O payload de rascunho não deve ser consultado como fonte operacional após a conclusão.
- Logo, SMS, horários por profissional, convites e onboarding Stripe Connect permanecem entregas
  separadas, sem bloquear a criação da clínica.
- Esta decisão evolui e substitui o formato funcional descrito na ADR-011; as garantias de concorrência,
  retomada, autorização e idempotência daquela ADR permanecem vigentes.
