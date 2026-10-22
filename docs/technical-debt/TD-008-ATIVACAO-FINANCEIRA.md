# TD-008 — Ativação financeira após o onboarding Connect

Status: aberta. Data: 2026-10-22. Decisão: [ADR-016](../decisions/ADR-016-STRIPE-CONNECT-INCORPORADO.md).

O cadastro Connect e os componentes financeiros incorporados não implementam a venda de serviços.
Antes de receber pagamentos reais:

- Implementar checkout/direct charges, assinaturas dos clientes e compra/consumo de pacotes com
  autorização clínica, preços calculados pelo servidor e idempotência.
- Implementar eventos assinados (incluindo eventos v2 de requisitos/capabilities), deduplicação,
  conciliação e efeitos locais de reembolso/disputa. A consulta de status atual é síncrona e não
  equivale a um ledger financeiro. Não usar `payment_preferences.provider_status` para liberar venda.
- Separar ambientes/chaves; validar políticas Stripe, recebimento/reembolso/disputa/repasse reais,
  domínios dos componentes e mensagens contratuais antes de remover o bloqueio de chaves live.
- Separar a permissão financeira de `settings:manage` antes de delegar configurações a funcionários.
  Revisar revogação de sessões Stripe já emitidas e autenticação forte para ações financeiras.
- Rate limit é local à Machine; distribuir antes de escalar horizontalmente.
- Automatizar reconciliação de reservas sem account ID após falha incerta, mantendo o bloqueio seguro
  depois de 23h. A recuperação atual exige suporte com metadata e logs Stripe.
- Implementar billing clínica → Luminix somente após esclarecer vencimentos e alcance do bloqueio;
  preços/carência/promessa estão registrados na ADR-016, sem cobrança ou bloqueio automáticos.

Verificação do cadastro com documentos/dados bancários de teste no navegador e de todos os
componentes incorporados deve preceder uso por clínicas. Criação de Account Session não comprova
que o KYC terminou nem que a interface de cada componente carregou.
