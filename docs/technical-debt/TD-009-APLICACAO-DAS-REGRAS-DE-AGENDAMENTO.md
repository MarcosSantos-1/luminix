# TD-009 — Aplicação das regras no agendamento para clientes

Status: Aberta. Prioridade: P1 antes da abertura do agendamento público.

Data: 2026-10-25.

O onboarding persiste regras em `booking_policies` (ADR-017), mas o fluxo de agendamento para
clientes ainda não aplica antecedência, horizonte, cancelamento ou remarcação. O recado também
não é publicado no portal. A interface informa essa limitação e não simula cobrança ou multa.

Antes de abrir o fluxo, implementar leitura operacional autorizada por clínica, aplicação dos
limites no servidor, fuso da clínica, concorrência, limites exatos de tempo e precedência:
exceção do serviço, cancelamento especial para `manual_release`, padrão da clínica. Remarcação
nula acompanha o prazo aplicável; valor explícito tem prioridade para remarcação. Limites novos
nulos em clínicas antigas precisam de definição explícita antes de ativação, sem inventar defaults
retroativos. A agenda administrativa deve ter política própria para exceções e auditoria.

Exibir orientações como texto simples e verificar a aceitação/ciência das regras quando o fluxo
for especificado. Implementar edição posterior segura das políticas antes de prometer alterações
no painel. Cobrir fronteiras de horário, isolamento entre clínicas, troca de sessão e mudanças
concorrentes; definir efeitos sobre reservas existentes. Vídeos explicativos dependem de conteúdo
real fornecido/aprovado, sem players falsos ou links vazios.
