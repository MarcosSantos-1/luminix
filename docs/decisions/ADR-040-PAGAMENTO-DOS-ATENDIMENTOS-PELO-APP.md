# ADR-040 — Pagamento do atendimento pelo app (etapa 1)

Status: Accepted (implementado em modo teste: migration 0068, API, site, app e agenda)

Data: 2026-11-24

## Contexto

A cliente escolhia Pix ou cartão ao agendar, mas o pagamento era só anotado ("simulado"). A
clínica já liga uma conta Stripe Connect (ADR-016); faltava cobrar de verdade.

## Decisão

- **Cobrança direta na conta da clínica** (Stripe Checkout com `stripeAccount`, direct charge).
  O dinheiro não passa pelo Luminix e **não há comissão** nesta fase; a taxa da Stripe é da
  clínica. Valor cheio, à vista (sem parcelamento), só serviços de preço fixo.
- **Horário segurado:** ao agendar com Pix/cartão o atendimento fica `scheduled` com
  `online_payment_status = awaiting` por 35 min (a Stripe exige pelo menos 30 min de prazo).
  Visitas a menos de ~31 min pagam no local. Sem pagamento no prazo, a mesma expiração preguiçosa
  do sinal Pix (`expire_deposit_holds`) cancela com `cancellation_origin = payment_expired`.
- **Ordem das chamadas:** conferir a conta Connect pronta (fora do SQL) → reservar em transação
  curta → criar o Checkout na Stripe (fora do SQL) → registrar a sessão. Se a Stripe recusar, o
  horário é liberado na hora (`client_release_online_hold`). Pix não habilitado na conta → `409
Pix unavailable` (a cliente escolhe cartão).
- **Confirmação só por webhook Connect assinado** (`POST /payments/stripe/webhook`,
  `STRIPE_CONNECT_WEBHOOK_SECRET`), um evento uma vez (`connect_events`). Pago → lançamento de
  receita no Financeiro (Pix ou crédito, "Pago pelo app"), atendimento pago e, se o serviço for
  instantâneo, confirmado. Sessão expirada/Pix recusado → horário liberado. A sessão de uma conta
  nunca paga visita de outra clínica (`Payment owner mismatch`).
- **Pago depois do prazo:** o horário já foi liberado; o pagamento fica `paid_late` (precisa de
  estorno, etapa 2) e gera log de aviso. Nunca vira receita nem reabre o horário.
- **Cancelar visita paga pelo app:** até existir o estorno (etapa 2), a cliente recebe `409
Contact the space`; a clínica cancela e estorna pelo painel da Stripe.
- **Site/app:** depois de agendar vão direto à página da Stripe; na agenda, "pague até HH:MM" com
  "Pagar agora" (sessão ainda aberta) e "pago pelo app". Admin: selo "Aguardando pagamento".

## Configuração

Webhook Connect `we_1UfIWCCz54koiZqRILq9wCzy` (modo teste) com `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` e
`checkout.session.expired`. O provider só funciona com `sk_test_` enquanto o bloqueio de chaves
live da ADR-016 existir.

### Validação na Stripe de teste — 2026-11-24

A conta Connect de teste do "Studio Luniere" recusava Checkout por não ter nome público. Com
`display_name` preenchido, sessões de cartão e de Pix abrem na conta da clínica. O provider
preenche o nome do espaço e repete uma vez quando a Stripe recusa por isso.

## Consequências

- Migration 0068: `online_payments`, `connect_events` (RLS + FORCE; inventário 56) e colunas de
  pagamento no agendamento; `expire_deposit_holds` também expira pagamentos.
- Pendências em [TD-018](../technical-debt/TD-018-PAGAMENTO-PELO-APP.md).
