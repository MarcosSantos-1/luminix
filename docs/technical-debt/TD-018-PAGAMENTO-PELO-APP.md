# TD-018 — Pagamento do atendimento pelo app: etapas seguintes

ID: TD-018
Data: 2026-11-24
Módulo: `online_payments`, `apps/api/src/modules/payments/online-*`, área do cliente

Problema:

1. Estorno parcial (ex.: reter uma taxa de cancelamento) ainda não existe: estorno é sempre do
   valor cheio. O app nativo ainda não mostra "valor devolvido" (só o site).
2. Contas Connect criadas sem nome público não abrem Checkout ("set an account or business name").
   A API agora dá o nome do espaço à conta e tenta de novo; o ideal é pedir o nome já no cadastro.
   Validado em 2026-11-24 na conta de teste `acct_1UV3LdCz54IQYanW`: cartão e Pix abrem.
3. Etapa 3: link de pagamento pela equipe (ou pagamento pela página de confirmação, sem login) e
   pacotes. O sinal pela Stripe foi feito na ADR-042.
4. E-mail de pagamento confirmado para a cliente. O comprovante da Stripe já abre no histórico
   (ADR-042).
5. O app nativo abre a página da Stripe no navegador; voltar ao app depende de recarregar a lista.
6. Chaves live: rever o bloqueio `sk_test_` da ADR-016 e separar ambientes antes de dinheiro real.
7. Conciliar o estado do estorno antes de usar dinheiro real. Hoje a resposta com ID é registrada
   como devolvida mesmo quando a Stripe responde `pending`. Acompanhar o ciclo até `succeeded` ou
   `failed` por eventos da conta Connect e refletir a situação no Financeiro e na área da cliente.
   [Estados de devolução na Stripe](https://docs.stripe.com/refunds)

Impacto atual: baixo (modo teste, sem clientes reais).
Quando deve ser resolvido: 2, 6 e 7 antes de ligar pagamento real. Os demais seguem o roadmap.
Prioridade: P1
Status: aberto
