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

Estado original (cadastro Stripe evoluído na [ADR-016](ADR-016-STRIPE-CONNECT-INCORPORADO.md)):
preferência por Stripe Connect e forma de recebimento de pacotes são persistidas, mas não criam conta
conectada nem cobrança. SMS, upload da logo e importação de tabela por IA não são simulados: a UI os
identifica como próximos passos dependentes das integrações correspondentes.

Todas as novas tabelas possuem RLS forçada, imutabilidade de `clinic_id`, auditoria e chaves compostas
tenant-aware. A função `complete_onboarding` continua `SECURITY DEFINER`, exige contexto validado,
membership ativo e `onboarding:manage`, e permanece idempotente após sucesso.

## Consequências

### Evolução da configuração de aparelhos — 2026-10-16

Na etapa de detalhes, o card de aparelhos alugados/compartilhados fica imediatamente abaixo da
busca. A resposta negativa exige confirmação antes de ocultar o card; um link permite reabrir a
configuração. A preferência opcional `specialTreatmentsDismissed` acompanha o JSON do rascunho,
sem nova coluna ou migration. O fluxo usa o contrato v3 vigente da ADR-014.

O modal apresenta cards selecionáveis de aparelhos sugeridos somente a partir dos serviços
escolhidos. Sugestões não classificam automaticamente um serviço como especial. Aparelhos
personalizados podem vincular serviços existentes ou criar um novo atendimento, inicialmente
com 60 minutos e preço sob consulta, valores informados na interface e editáveis nos detalhes.
Fechar/cancelar o modal descarta a edição local; salvar aplica os vínculos ao rascunho do onboarding,
persistido ao navegar/salvar pelo fluxo existente.

Serviços vinculados recebem estrela, texto “Especial” e contorno dourado. Reutilizam
`bookingMode = manual_release` e `resourceName`; a conclusão materializa `resources` e
`service_resources` com o isolamento já existente. Ajustar preço/duração não redefine o modo de
agendamento. O contrato atual representa um aparelho por serviço e permite vários serviços no
mesmo aparelho; capacidades simultâneas e múltiplos aparelhos por serviço exigem evolução própria.

Esta entrega configura dependências. Liberação operacional de datas, bloqueio de conflitos de
equipamento na agenda, cobrança e multas continuam pendentes e não são ativados por este modal.

### Consequências da decisão original

- Pelo menos um serviço é obrigatório para concluir, mas rascunhos iniciais vazios continuam válidos.
- Endereço, documento e redes sociais são opcionais; contato, nome, serviço e horário válido são
  revalidados no backend.
- O payload de rascunho não deve ser consultado como fonte operacional após a conclusão.
- Logo, SMS, horários por profissional, convites e onboarding Stripe Connect permanecem entregas
  separadas, sem bloquear a criação da clínica.
- Esta decisão evolui e substitui o formato funcional descrito na ADR-011; as garantias de concorrência,
  retomada, autorização e idempotência daquela ADR permanecem vigentes.
