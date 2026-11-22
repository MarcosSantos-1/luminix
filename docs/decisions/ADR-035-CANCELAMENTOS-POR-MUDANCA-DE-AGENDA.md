# ADR-035 — Cancelamentos por mudança de agenda e dia exclusivo de locação

Status: Accepted

Data: 2026-11-22

Substitui em parte: ADR-031 ("fechar um período não cancela atendimentos já marcados").

## Contexto

Reduzir o horário de um dia, fechar um dia ou um período, ou reservar o dia de uma locação
deixava atendimentos marcados "órfãos" na agenda: a cliente não era avisada e a gestora só via
uma contagem. O legado (Charme & Bela) resolvia com prévia dos afetados + confirmação + aviso.

## Decisão

- **Antes/depois na mesma transação.** `luminix.schedule_fitting_appointments(clinic)` (migration 0057) devolve os atendimentos futuros abertos que a agenda da cliente ainda ofereceria: dia do
  espaço, data/semana própria da profissional (mesma regra de `freeSlots`), fechamentos, aparelho
  alugado e dia exclusivo. A rota lê o conjunto, aplica a mudança e compara
  (`schedule-impact.ts`). Afetado = cabia antes e não cabe depois. Atendimentos marcados de
  propósito fora do horário (chave mestra) nunca "cabem" e não são cancelados por mudanças
  posteriores.
- **Confirmação.** Sem `confirmCancellations`, a transação é desfeita e a API responde **409**
  `{ error: 'Schedule impact', total, affected: [{ clientId, name, phone, photoUrl,
appointments[] }] }`. O admin (`useCancellationGuard`) mostra foto, nome, telefone, quantidade e
  horários; "Cancelar horários e avisar" repete o pedido com `confirmCancellations: true`;
  "Voltar sem salvar" mantém tudo como estava.
- **Cancelamento.** `cancel_for_schedule_change` (SECURITY DEFINER) exige a mesma permissão da
  mudança (`schedule:manage`, `vacation:manage`, `professional:manage` ou `service:manage`),
  grava `status = canceled`, `status_note` (motivo), `canceled_at` e
  `cancellation_origin = 'schedule_change'`. Sessão de pacote volta ao saldo (regra existente).
- **Aviso.** E-mail `appointment_canceled_by_space` após o commit para quem tem e-mail (é
  transacional, não depende de opt-in de marketing). Na área da cliente (web e app), o aviso
  "O espaço cancelou seu horário" com o motivo, derivado do próprio atendimento. WhatsApp entra
  quando a API for conectada, no mesmo ponto (`settleScheduleImpact` devolve a lista).
- **Rotas cobertas:** `availability` (rotina e data especial), `schedule-plan`, `closures`
  (criar/editar), `team/:id` (rotina da profissional), aluguel novo exclusivo,
  `catalog/rentals/:id/exclusive` e remoção de aluguel.
- **Dia exclusivo de locação:** `resource_rentals.exclusive`. Nesses dias a cliente só vê
  horários dos serviços ligados ao aparelho (`exclusive_rental_blocks`). A equipe ainda marca
  outro tratamento, com o aviso `exclusive` (chave mestra). A Agenda marca o dia como
  "Reservado · aparelho".

## Consequências

- O e-mail sai em melhor esforço (falha registrada em log, sem fila/retry).
- Pendências em [TD-015](../technical-debt/TD-015-CANCELAMENTOS-POR-MUDANCA-DE-AGENDA.md).
