# TD-018 — Pagamento do atendimento pelo app: etapas seguintes

ID: TD-018
Data: 2026-11-24
Módulo: `online_payments`, `apps/api/src/modules/payments/online-*`, área do cliente

Problema:

1. Estorno (etapa 2): automático quando a cliente cancela dentro do prazo ou a clínica cancela;
   "Estornar" no atendimento; tratar `paid_late`. Hoje a cliente não cancela visita paga.
2. Contas Connect criadas sem nome público não abrem Checkout ("set an account or business name").
   A API agora dá o nome do espaço à conta e tenta de novo; o ideal é pedir o nome já no cadastro.
   Validado em 2026-11-24 na conta de teste `acct_1UV3LdCz54IQYanW`: cartão e Pix abrem.
3. Etapa 3: link de pagamento pela equipe, pacotes e sinal pela Stripe.
4. Recibo/e-mail de pagamento confirmado para a cliente.
5. O app nativo abre a página da Stripe no navegador; voltar ao app depende de recarregar a lista.
6. Chaves live: rever o bloqueio `sk_test_` da ADR-016 e separar ambientes antes de dinheiro real.

Impacto atual: baixo (modo teste, sem clientes reais).
Quando deve ser resolvido: 1 e 2 antes de ligar pagamento real; 3–5 depois do lançamento.
Prioridade: P1
Status: aberto
