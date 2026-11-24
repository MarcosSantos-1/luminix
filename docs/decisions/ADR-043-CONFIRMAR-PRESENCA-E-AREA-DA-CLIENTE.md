# ADR-043 — Confirmar presença pela área da cliente

Status: Accepted (migration 0072, `POST /client/spaces/:slug/appointments/:id/confirm`)

Data: 2026-11-24

Complementa: ADR-038 (link de confirmação sem login).

## Decisão

- Um horário marcado pela equipe fica "a confirmar" para a cliente até ela tocar em **"Vou, sim"**
  na agenda da área logada. `client_confirm_presence` grava `appointments.client_confirmed_at` e
  passa `scheduled` → `confirmed`, exceto com sinal ou pagamento pelo app pendente.
- A agenda do painel lê a **resposta mais recente** entre o link (ADR-038) e a área da cliente
  (`link_answer` calculado), sem mudar a tela do admin.
- `GET /client/spaces/:slug/appointments` devolve `presenceConfirmed` (ela agendou, confirmou pela
  área ou pelo link).
- `GET /client/spaces/:slug/packages` lista os pacotes ativos com o preço avulso equivalente.

## Área da cliente (mesma entrega)

Agenda com link direto (`?horario=` / `?dia=`) e destaque animado do horário e do dia; aviso
"O espaço marcou um horário para você"; histórico com mês vigente por padrão, busca, filtros e
cores por situação; notificações com filtros, grupos por data e exclusão (guardada no aparelho,
pois os avisos são derivados dos dados); página de localização (`/cliente/localizacao`) com mapa,
copiar endereço, Google Maps e Waze; espaços em cartões na cor de cada espaço.
