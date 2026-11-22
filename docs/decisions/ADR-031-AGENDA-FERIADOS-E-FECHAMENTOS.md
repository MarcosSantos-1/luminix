# ADR-031 — Agendamento em etapas, feriados e fechamentos por período

Status: Accepted

Data: 2026-11-18

## Contexto

O "Novo agendamento" do gestor era um formulário único (cliente, serviço, profissional, data,
hora digitada e observações), ruim no celular. A agenda não conhecia feriados nem períodos sem
atendimento (férias da equipe, recesso, luto, manutenção): só datas avulsas em
`schedule_overrides` (ADR-012).

## Decisão

- **Agendamento em etapas** (`booking-modal.tsx`): Cliente → Serviço → Profissional → Dia e
  horário → Confirmar. A etapa Profissional só aparece com mais de uma profissional ativa; com uma,
  ela fica implícita. O horário é escolhido em blocos (passo = duração do serviço, entre 15 e
  60 min). Em dias com expediente, o atendimento do gestor pode começar até 2 h antes da
  abertura e precisa terminar até 4 h depois do fechamento, inclusive quando passa da meia-noite.
  Em dias sem expediente, a chave mestra continua disponível após confirmação. Blocos fora do expediente,
  ocupados ou passados continuam tocáveis e passam pela confirmação da chave mestra (ADR-012).
  Observações internas saíram do fluxo de criação; o campo continua no banco e na ficha.
- **Fechamentos por período**: tabela `schedule_closures` (migration 0041) com
  `professional_id` opcional (NULL = espaço inteiro), início/fim inclusivos (até 1 ano) e motivo
  fechado (`vacation`, `collective_vacation`, `bereavement`, `maintenance`, `renovation`,
  `sick_leave`, `training`, `event`, `other`). Escrita só por `save_schedule_closure` /
  `delete_schedule_closure` (SECURITY DEFINER): espaço exige `clinic:manage`; uma profissional
  exige `professional:manage`. RLS + FORCE, auditoria e trava de tenant como as demais tabelas.
- Cliente (autoagendamento) **não vê horários** em dias fechados do espaço nem com a profissional
  ausente. O gestor recebe o aviso `closure` (novo código em `override_reasons`) e pode confirmar.
- ~~Fechar um período **não cancela** atendimentos já marcados.~~ Substituído pela
  [ADR-035](ADR-035-CANCELAMENTOS-POR-MUDANCA-DE-AGENDA.md): a gestora vê os afetados e confirma o
  cancelamento com aviso às clientes.
- **Feriados** calculados no admin (`lib/holidays.ts`): nacionais, Páscoa e móveis, pontos
  facultativos comuns (Carnaval, Corpus Christi, 24/12, 31/12), estaduais das 27 UFs e municipais
  das capitais, pela cidade/UF de `locations` (principal). Feriado nunca fecha sozinho: vira o
  aviso "vai abrir?" na Agenda, 40 dias antes, apenas em dias que o espaço normalmente abre e
  ainda sem data especial. "Fechar" e "Abrir normal" gravam uma data especial com o nome do
  feriado como motivo; "Outro horário" abre "Datas especiais"; "Perguntar depois" adia 3 dias.
- UI: aba "Férias e fechamentos" no modal Horários; calendário mensal em mapa de calor relativo ao
  dia mais cheio do mês, com feriados, fechamentos e ausências marcados.

## Consequências

- Remoção de fechamento usa `POST closures/:id/remove` (o proxy do admin não encaminha DELETE).
- Pendências registradas em [TD-013](../technical-debt/TD-013-FERIADOS-E-FECHAMENTOS.md).
