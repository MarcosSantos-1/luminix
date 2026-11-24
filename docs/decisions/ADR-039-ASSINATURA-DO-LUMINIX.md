# ADR-039 — Assinatura do Luminix (clínica → Luminix)

Status: Accepted (implementado: migration 0067, módulo `billing` da API, "Meu plano" no admin;
cobrança real depende de configurar a Stripe Billing com o CNPJ da Kommite)

Data: 2026-11-24

## Contexto

O painel já mostrava os 12 dias grátis (ADR-016), mas não havia plano, cobrança nem regra para
quando o teste acaba. O lançamento comercial está previsto para 10/12/2026; a Stripe só será
aberta quando o CNPJ da Kommite sair, por volta de 20/12.

## Decisão

- **Oferta:** plano único com tudo incluso. Mensal **R$ 99,90** ou anual **R$ 900** (equivale a
  R$ 75/mês). **12 dias grátis sem cartão**, contados da conclusão do cadastro do espaço.
- **Pagamento:** cartão com renovação automática (Stripe Billing, assinatura) ou Pix avulso
  (Stripe Checkout `mode=payment`, `pix`), que soma 1 mês ou 1 ano a partir do que já estava pago.
  A Stripe não faz Pix recorrente automático; o lembrete de vencimento do Pix fica em TD-017.
- **Estados** (`luminix.clinic_access_state`, sempre calculado no banco):
  `trial` (dentro dos 12 dias), `active` (pago, cortesia ou cartão em dia), `grace` (venceu há
  menos de 7 dias: aviso, ainda edita) e `read_only` (venceu há 7 dias ou mais).
- **Só leitura:** todas as leituras continuam; escritas da equipe respondem **402
  `Subscription required`**, exceto pagar (`/billing/*`), concluir o primeiro cadastro
  (`/onboarding`) e marcar avisos como lidos. A checagem roda em `withClinicTransaction` **depois
  da autorização**, para que só membros saibam do estado do plano. Nenhum dado é apagado.
- **Clientes da clínica:** a página pública continua no ar; **novos agendamentos online pausam**
  (`409 Booking paused`). Horários já marcados, cancelamentos e o link de confirmação seguem.
- **Fonte de verdade:** `clinic_subscriptions.paid_until` (pago até) + `complimentary_until`
  (cortesia, só por SQL). Só webhooks **assinados** da Stripe mudam o acesso
  (`apply_billing_event`), cada evento uma vez só (`billing_events`). Renovação no cartão só
  avança o "pago até" com status `active`; falha mantém o último período pago.
- **Quem paga:** `settings:manage` abre checkout e portal; qualquer membro vê o estado. O cliente
  Stripe é criado com chave de idempotência por clínica e ligado por `staff_set_billing_customer`;
  nunca se move cliente/assinatura de outra clínica (`Billing owner mismatch`).
- **Clínicas anteriores ao lançamento** (todas de teste) ganharam teste até 22/12/2026 na
  migration, para nenhuma ficar só leitura no dia do deploy.
- **Admin:** "Meu plano" com situação, planos, forma de pagamento e botão de pagar (ou "gerenciar
  cartão e faturas" no portal Stripe); faixa no topo em `grace`/`read_only`; qualquer 402 abre o
  plano. Sem a Stripe configurada, o botão vira "o pagamento online abre nos próximos dias".

## Configuração (quando a Stripe da Kommite existir)

Variáveis da API (Fly): `STRIPE_SECRET_KEY`, `STRIPE_BILLING_PRICE_MONTHLY` e
`STRIPE_BILLING_PRICE_ANNUAL` (preços recorrentes em BRL: R$ 99,90/mês e R$ 900/ano),
`STRIPE_BILLING_WEBHOOK_SECRET`. Webhook em `POST https://luminix-api.fly.dev/billing/stripe/webhook`
com os eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`customer.subscription.created|updated|deleted`. Ativar Pix e o portal do cliente na Stripe.
Enquanto o bloqueio de chaves live da ADR-016 existir, o Connect só aceita chaves de teste; a
assinatura usa o mesmo cliente Stripe e herda essa regra até ser revista.

## Consequências

- Migration 0067: duas tabelas com RLS + FORCE (inventário 54), funções `SECURITY DEFINER`,
  gatilho que cria a assinatura de cada clínica nova.
- Pendências em [TD-017](../technical-debt/TD-017-ASSINATURA-DO-LUMINIX.md).

### Modo teste ligado — 2026-11-24

Na conta Stripe de teste da plataforma (`acct_1UBfvrCz54koiZqR`, a mesma do Connect): produto
`prod_VgfRVP4GKfxsTr`, preços `price_1UfI76Cz54koiZqR3YAhk0x3` (mensal, `luminix_monthly`) e
`price_1UfI76Cz54koiZqR5nhjWuGb` (anual, `luminix_annual`), webhook `we_1UfI7RCz54koiZqRJ1uJWiKn`
para `/billing/stripe/webhook` e portal padrão `bpc_1UfI7RCz54koiZqRbMjpaMit` (troca de cartão,
faturas, cancelamento no fim do período). Variáveis `STRIPE_BILLING_*` no Fly e no `.env` local.
Validado: webhook sem assinatura recusado (400); assinatura de teste com clínica inexistente chegou
assinada e foi ignorada (`P0002`), depois cancelada e apagada; sessão Pix criada. Cartão de teste:
`4242 4242 4242 4242`; recusa: `4000 0000 0000 0341` (falha na renovação).

**Atenção ao ir para produção:** pagamentos de teste gravam `paid_until`/clientes `cus_` de teste
nas clínicas do banco principal. Antes das chaves live, limpar `stripe_customer_id`,
`stripe_subscription_id`, `card_status` e `paid_until` vindos do modo teste e trocar preços,
webhook e segredo pelos da conta live.
